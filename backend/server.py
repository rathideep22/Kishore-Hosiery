from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, Header, Query, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from bson.objectid import ObjectId
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import asyncio
from pdf_utils import OrderPDFGenerator

ROOT_DIR = Path(__file__).parent
env_path = ROOT_DIR / '.env'
load_dotenv(env_path, override=True)

mongo_url = os.environ.get('MONGODB_URL')
if not mongo_url:
    raise ValueError("MONGODB_URL not found in environment. Please set it in .env or as an environment variable.")
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'kishore_hosiery')]

JWT_SECRET = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
MOCK_OTP = '1234'

# AWS S3 Configuration
AWS_ACCESS_KEY_ID = os.environ.get('AWS_ACCESS_KEY_ID')
AWS_SECRET_ACCESS_KEY = os.environ.get('AWS_SECRET_ACCESS_KEY')
AWS_S3_BUCKET = os.environ.get('AWS_S3_BUCKET', 'bills-kishore')
AWS_REGION = os.environ.get('AWS_REGION', 'us-east-1')

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# ─── Models ───────────────────────────────────────────────────────────────────

class SendOTPRequest(BaseModel):
    phone: str

class VerifyOTPRequest(BaseModel):
    phone: str
    otp: str

class CreateUserRequest(BaseModel):
    phone: str
    firstName: str
    lastName: str
    role: str

class OrderProductItem(BaseModel):
    productId: str
    alias: str
    category: str
    size: str
    printName: str
    quantity: int
    rate: Optional[str] = None
    requireSerialNo: bool = False
    serialNumbers: Optional[List[Optional[str]]] = None

class UpdateOrderRequest(BaseModel):
    partyName: Optional[str] = None
    location: Optional[str] = None
    godown: Optional[str] = None
    message: Optional[str] = None
    totalParcels: Optional[int] = None
    items: Optional[List[OrderProductItem]] = None

class UpdateBillRequest(BaseModel):
    billNo: str

class GodownUpdateRequest(BaseModel):
    godown: str
    readyParcels: int

class CreateProductRequest(BaseModel):
    category: str
    size: str
    printName: str
    alias: str

class UpdateProductRequest(BaseModel):
    category: Optional[str] = None
    size: Optional[str] = None
    printName: Optional[str] = None
    alias: Optional[str] = None

class CreateOrderRequest(BaseModel):
    partyName: str
    location: str
    message: str
    godown: str  # Which gowdown this order is for
    items: Optional[List[OrderProductItem]] = []
    totalParcels: Optional[int] = None

class ParcelFulfillmentRequest(BaseModel):
    productId: str
    parcelIndex: int
    weight: Optional[float] = None
    serialNo: Optional[str] = None

# ─── WebSocket Manager ───────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        self.active_connections.pop(user_id, None)

    async def broadcast(self, message: dict):
        for uid, conn in list(self.active_connections.items()):
            try:
                await conn.send_json(message)
            except Exception:
                self.disconnect(uid)

    async def send_to_user(self, user_id: str, message: dict):
        conn = self.active_connections.get(user_id)
        if conn:
            try:
                await conn.send_json(message)
            except Exception:
                self.disconnect(user_id)

manager = ConnectionManager()


# ─── Auth Helpers ─────────────────────────────────────────────────────────────

def create_token(user: dict) -> str:
    payload = {
        "userId": user['id'],
        "phone": user['phone'],
        "role": user['role'],
        "exp": datetime.now(timezone.utc) + timedelta(days=30)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_auth_user(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No valid token provided")
    token = authorization.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload['userId']}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def require_admin(user: dict):
    if user.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")

def require_admin_or_staff(user: dict):
    if user.get('role') not in ['admin', 'staff']:
        raise HTTPException(status_code=403, detail="Admin or staff access required")

def require_admin_or_accountant(user: dict):
    if user.get('role') not in ['admin', 'accountant']:
        raise HTTPException(status_code=403, detail="Admin or accountant access required")

# ─── Notification & Audit Helpers ─────────────────────────────────────────────

async def create_notification(user_id: str, message: str, ntype: str, order_id: str = None):
    notif = {
        "id": str(uuid.uuid4()),
        "userId": user_id,
        "message": message,
        "type": ntype,
        "orderId": order_id,
        "read": False,
        "sound": True,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one({**notif})
    await manager.send_to_user(user_id, {"type": "NOTIFICATION", "notification": notif, "sound": True})
    return notif


async def create_audit_log(user_id: str, action: str, order_id: str = None, details: str = ""):
    log_entry = {
        "id": str(uuid.uuid4()),
        "userId": user_id,
        "action": action,
        "orderId": order_id,
        "details": details,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await db.audit_logs.insert_one({**log_entry})


async def get_next_order_id():
    counter = await db.counters.find_one_and_update(
        {"name": "orderId"},
        {"$inc": {"value": 1}},
        upsert=True,
        return_document=True
    )
    return counter['value']


# ─── Health Check (Public) ────────────────────────────────────────────────────

@api_router.get("/health")
async def health_check():
    return {"status": "ok", "message": "Backend is running"}


# ─── Auth Routes ──────────────────────────────────────────────────────────────

@api_router.post("/auth/send-otp")
async def send_otp(req: SendOTPRequest):
    user = await db.users.find_one({"phone": req.phone}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found. Only pre-registered users can login.")
    # Mock OTP — in production replace with Twilio
    await db.otp_store.update_one(
        {"phone": req.phone},
        {"$set": {"otp": MOCK_OTP, "createdAt": datetime.now(timezone.utc).isoformat()}},
        upsert=True
    )
    logger.info(f"OTP requested for pre-registered user: {req.phone}")
    return {"message": "OTP sent successfully", "mock_otp": MOCK_OTP}


@api_router.post("/auth/verify-otp")
async def verify_otp(req: VerifyOTPRequest):
    user = await db.users.find_one({"phone": req.phone}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found. Only pre-registered users can login.")
    if req.otp != MOCK_OTP:
        stored = await db.otp_store.find_one({"phone": req.phone})
        if not stored or stored.get('otp') != req.otp:
            raise HTTPException(status_code=400, detail="Invalid OTP")
    token = create_token(user)
    logger.info(f"User logged in: {req.phone} (ID: {user['id']})")
    return {"token": token, "user": user}


@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_auth_user)):
    return user


# ─── User Routes ──────────────────────────────────────────────────────────────

@api_router.get("/users")
async def get_users(user: dict = Depends(get_auth_user)):
    require_admin(user)
    users = await db.users.find({}, {"_id": 0}).to_list(100)
    return users


@api_router.post("/users")
async def create_user(req: CreateUserRequest, user: dict = Depends(get_auth_user)):
    require_admin(user)
    existing = await db.users.find_one({"phone": req.phone})
    if existing:
        raise HTTPException(status_code=400, detail="Phone number already registered")
    new_user = {
        "id": str(uuid.uuid4()),
        "phone": req.phone,
        "firstName": req.firstName,
        "lastName": req.lastName,
        "role": req.role,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one({**new_user})
    await create_audit_log(user['id'], "USER_CREATED", None, f"Created user {req.firstName} {req.lastName}")
    return new_user


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(get_auth_user)):
    require_admin(user)
    target = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target['role'] == 'admin':
        raise HTTPException(status_code=400, detail="Cannot delete admin users")
    await db.users.delete_one({"id": user_id})
    await create_audit_log(user['id'], "USER_DELETED", None, f"Deleted user {target['firstName']} {target['lastName']}")
    return {"message": "User deleted"}


# ─── Order Routes ─────────────────────────────────────────────────────────────

@api_router.get("/orders")
async def get_orders(
    user: dict = Depends(get_auth_user),
    status: Optional[str] = None,
    search: Optional[str] = None,
    godown: Optional[str] = None,
    include_completed: Optional[bool] = False
):
    conditions = []
    user_role = user.get('role', 'staff')

    # Exclude completed orders from normal views (unless explicitly requested)
    if not include_completed:
        conditions.append({"completed": {"$ne": True}})

    # Accountant: sees Ready/Partial Ready orders (ready to bill) or dispatched orders
    if user_role == 'accountant':
        conditions.append({"$or": [
            {"readinessStatus": {"$in": ["Ready", "Partial Ready"]}},
            {"dispatched": True}
        ]})
    elif user_role == 'staff':
        # Staff sees only non-dispatched orders
        conditions.append({"dispatched": False})
    # Admin sees all non-completed orders (no filter)

    if status == 'ready':
        conditions.append({"readinessStatus": "Ready", "dispatched": False})
    elif status == 'partial':
        conditions.append({"readinessStatus": "Partial Ready", "dispatched": False})
    elif status == 'pending':
        conditions.append({"readinessStatus": "Pending", "dispatched": False})
    elif status == 'dispatched':
        conditions.append({"dispatched": True})
    elif status == 'active':
        conditions.append({"dispatched": False})
    if search:
        conditions.append({
            "$or": [
                {"partyName": {"$regex": search, "$options": "i"}},
                {"orderId": {"$regex": search, "$options": "i"}}
            ]
        })
    if godown:
        conditions.append({"godown": godown})
    query = {"$and": conditions} if conditions else {}
    orders = await db.orders.find(query, {"_id": 0}).sort("createdAt", -1).to_list(500)
    return orders


@api_router.post("/orders")
async def create_order(req: CreateOrderRequest, user: dict = Depends(get_auth_user)):
    require_admin_or_staff(user)
    order_num = await get_next_order_id()
    items = [item.dict() for item in req.items] if req.items else []
    total_parcels = sum(item.quantity for item in req.items) if req.items else req.totalParcels or 0
    order = {
        "id": str(uuid.uuid4()),
        "orderId": f"KH-{order_num:04d}",
        "partyName": req.partyName,
        "location": req.location,
        "message": req.message,
        "godown": req.godown,
        "items": items,
        "totalParcels": total_parcels,
        "godownDistribution": [],
        "readinessStatus": "Pending",
        "dispatched": False,
        "dispatchedAt": None,
        "billNo": None,
        "completed": False,
        "completedAt": None,
        "createdBy": user['id'],
        "createdByName": f"{user['firstName']} {user['lastName']}",
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    await db.orders.insert_one({**order})

    # Notify all staff
    staff_users = await db.users.find({"role": "staff"}, {"_id": 0}).to_list(100)
    for staff in staff_users:
        await create_notification(
            staff['id'],
            f"New Order {order['orderId']} for {order['partyName']}",
            "new_order",
            order['id']
        )
    await create_audit_log(user['id'], "ORDER_CREATED", order['id'], f"Created order {order['orderId']}")
    await manager.broadcast({"type": "ORDER_CREATED", "order": order})
    return order


@api_router.get("/orders/{order_id}")
async def get_order(order_id: str, user: dict = Depends(get_auth_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@api_router.put("/orders/{order_id}")
async def update_order(order_id: str, req: UpdateOrderRequest, user: dict = Depends(get_auth_user)):
    require_admin(user)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    update = {"updatedAt": datetime.now(timezone.utc).isoformat()}
    if req.partyName is not None:
        update["partyName"] = req.partyName
    if req.location is not None:
        update["location"] = req.location
    if req.godown is not None:
        update["godown"] = req.godown
    if req.message is not None:
        update["message"] = req.message
    if req.items is not None:
        update["items"] = [item.dict() for item in req.items]
    if req.totalParcels is not None:
        update["totalParcels"] = req.totalParcels
        total_ready = sum(g.get('readyParcels', 0) for g in order.get('godownDistribution', []))
        if total_ready >= req.totalParcels:
            update["readinessStatus"] = "Ready"
        elif total_ready > 0:
            update["readinessStatus"] = "Partial Ready"
        else:
            update["readinessStatus"] = "Pending"
    await db.orders.update_one({"id": order_id}, {"$set": update})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    await create_audit_log(user['id'], "ORDER_UPDATED", order_id, f"Updated order {order['orderId']}")
    await manager.broadcast({"type": "ORDER_UPDATED", "order": updated})
    return updated


@api_router.put("/orders/{order_id}/bill")
async def update_bill(order_id: str, req: UpdateBillRequest, user: dict = Depends(get_auth_user)):
    require_admin_or_accountant(user)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    update = {
        "billNo": req.billNo,
        "readinessStatus": "Bill Generated",
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    await db.orders.update_one({"id": order_id}, {"$set": update})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})

    # Notify admins when accountant adds a bill
    if user.get('role') == 'accountant':
        admins = await db.users.find({"role": "admin"}, {"_id": 0}).to_list(10)
        for admin_user in admins:
            await create_notification(
                admin_user['id'],
                f"Bill #{req.billNo} added to order {order['orderId']} by {user['firstName']}",
                "bill_added",
                order['id']
            )

    await create_audit_log(user['id'], "BILL_UPDATED", order_id, f"Bill {req.billNo} set on {order['orderId']}")
    await manager.broadcast({"type": "ORDER_UPDATED", "order": updated})
    return updated


@api_router.put("/orders/{order_id}/complete")
async def complete_order(order_id: str, user: dict = Depends(get_auth_user)):
    require_admin(user)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Generate PDF and upload to S3
    pdf_url = None
    try:
        logging.info(f"🔄 Starting PDF generation for order {order_id}")
        pdf_generator = OrderPDFGenerator()
        pdf_url = pdf_generator.generate_order_bill(order)
        logging.info(f"✅ PDF generated successfully: {pdf_url}")
    except Exception as e:
        logging.error(f"❌ Error generating PDF for order {order_id}: {str(e)}", exc_info=True)
        # Continue with order completion even if PDF generation fails

    update = {
        "completed": True,
        "readinessStatus": "Completed",
        "completedAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }

    # Add PDF URL if generation was successful
    if pdf_url:
        update["billPdfUrl"] = pdf_url

    await db.orders.update_one({"id": order_id}, {"$set": update})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    await create_audit_log(user['id'], "ORDER_COMPLETED", order_id, f"Completed order {order['orderId']}")

    # Notify all users about order completion
    admin_users = await db.users.find({"role": "admin"}, {"_id": 0}).to_list(10)
    for admin_user in admin_users:
        await create_notification(admin_user['id'],
            f"Order {order['orderId']} has been completed!",
            "order_completed", order['id'])

    accountant_users = await db.users.find({"role": "accountant"}, {"_id": 0}).to_list(10)
    for accountant_user in accountant_users:
        await create_notification(accountant_user['id'],
            f"Order {order['orderId']} has been completed!",
            "order_completed", order['id'])

    staff_users = await db.users.find({"role": "staff"}, {"_id": 0}).to_list(100)
    for staff_user in staff_users:
        await create_notification(staff_user['id'],
            f"Order {order['orderId']} has been completed!",
            "order_completed", order['id'])

    await manager.broadcast({"type": "ORDER_UPDATED", "order": updated})
    return updated


@api_router.get("/orders/{order_id}/bill-pdf-url")
async def get_bill_pdf_url(order_id: str, user: dict = Depends(get_auth_user)):
    """Get the PDF bill URL for a completed order"""
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if not order.get("billPdfUrl"):
        raise HTTPException(status_code=404, detail="PDF not available for this order")

    return {
        "orderId": order.get("orderId"),
        "billPdfUrl": order.get("billPdfUrl"),
        "fileName": f"{order.get('orderId')}_bill.pdf"
    }


@api_router.delete("/orders/{order_id}")
async def delete_order(order_id: str, user: dict = Depends(get_auth_user)):
    require_admin(user)
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    await db.orders.delete_one({"id": order_id})
    await create_audit_log(user['id'], "ORDER_DELETED", order_id, f"Deleted order {order['orderId']}")
    await manager.broadcast({"type": "ORDER_DELETED", "orderId": order_id})
    return {"message": "Order deleted"}


# ─── Order Status Routes ─────────────────────────────────────────────────────

@api_router.put("/orders/{order_id}/godown")
async def update_godown(order_id: str, req: GodownUpdateRequest, user: dict = Depends(get_auth_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    godown_dist = order.get('godownDistribution', [])
    found = False
    for g in godown_dist:
        if g['godown'] == req.godown:
            g['readyParcels'] = req.readyParcels
            found = True
            break
    if not found:
        godown_dist.append({"godown": req.godown, "readyParcels": req.readyParcels})
    total_ready = sum(g['readyParcels'] for g in godown_dist)
    if total_ready >= order['totalParcels']:
        readiness = "Ready"
    elif total_ready > 0:
        readiness = "Partial Ready"
    else:
        readiness = "Pending"
    await db.orders.update_one({"id": order_id}, {"$set": {
        "godownDistribution": godown_dist,
        "readinessStatus": readiness,
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    await create_audit_log(user['id'], "GODOWN_UPDATED", order_id,
        f"Godown {req.godown}: {req.readyParcels} parcels for {order['orderId']}")
    if readiness == "Ready":
        admins = await db.users.find({"role": "admin"}, {"_id": 0}).to_list(10)
        for admin_user in admins:
            await create_notification(admin_user['id'],
                f"Order {order['orderId']} is fully ready for dispatch!",
                "order_ready", order['id'])
    await manager.broadcast({"type": "ORDER_UPDATED", "order": updated})
    return updated


@api_router.put("/orders/{order_id}/dispatch")
async def toggle_dispatch(order_id: str, request: Request, user: dict = Depends(get_auth_user)):
    try:
        body = await request.json()
        dispatch_note = body.get("dispatchNote", "")
    except Exception:
        dispatch_note = ""

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    new_val = not order.get('dispatched', False)

    update_data = {
        "dispatched": new_val,
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    if new_val:
        update_data["dispatchedAt"] = datetime.now(timezone.utc).isoformat()
        if dispatch_note:
            update_data["dispatchNote"] = dispatch_note

    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})

    await create_audit_log(user['id'], "DISPATCH_UPDATED", order_id,
        f"Order {order['orderId']} {'dispatched' if new_val else 'un-dispatched'}")

    if new_val:
        # Notify admins and accountants of dispatch
        admin_users = await db.users.find({"role": "admin"}, {"_id": 0}).to_list(10)
        for admin_user in admin_users:
            await create_notification(admin_user['id'],
                f"Order {order['orderId']} has been dispatched!",
                "order_dispatched", order['id'])

        accountant_users = await db.users.find({"role": "accountant"}, {"_id": 0}).to_list(10)
        for accountant_user in accountant_users:
            await create_notification(accountant_user['id'],
                f"Order {order['orderId']} has been dispatched!",
                "order_dispatched", order['id'])

    await manager.broadcast({"type": "ORDER_UPDATED", "order": updated})
    return updated


@api_router.put("/orders/{order_id}/split")
async def split_order(order_id: str, req: Request, user: dict = Depends(get_auth_user)):
    """Split order into ready and remainder orders"""
    try:
        body = await req.json()
        remainder_godown = body.get("remainderGodown", "")
    except Exception:
        remainder_godown = ""

    if not remainder_godown or not remainder_godown.strip():
        raise HTTPException(status_code=400, detail="remainderGodown is required")

    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    items = order.get('items', [])
    remaining_items = []

    # Calculate remaining parcels for each item
    for item in items:
        fulfilled = sum(1 for w in item.get('fulfillment', []) if w is not None)
        remaining = item.get('quantity', 0) - fulfilled

        # Only add to remaining if there are unfulfilled parcels
        if remaining > 0:
            remaining_items.append({
                "productId": item['productId'],
                "alias": item['alias'],
                "category": item['category'],
                "size": item['size'],
                "printName": item['printName'],
                "quantity": remaining,
                "rate": item.get('rate'),
                "requireSerialNo": item.get('requireSerialNo', False)
            })

    if not remaining_items:
        raise HTTPException(status_code=400, detail="No unfulfilled parcels to split")

    # Create remainder order
    order_num = await get_next_order_id()
    new_order_id_value = str(uuid.uuid4())
    new_order_display_id = f"KH-{order_num:04d}"

    new_order = {
        "id": new_order_id_value,
        "orderId": new_order_display_id,
        "partyName": order['partyName'],
        "location": order.get('location', ''),
        "godown": remainder_godown,
        "message": f"Remaining parcels from {order['orderId']}",
        "totalParcels": sum(item['quantity'] for item in remaining_items),
        "items": remaining_items,
        "readinessStatus": "Pending",
        "dispatched": False,
        "dispatchedAt": None,
        "createdByName": user.get('name', 'System'),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "godownDistribution": [],
        "parentOrderId": order_id
    }

    # Insert the new order
    result = await db.orders.insert_one(new_order)

    # Fetch the newly created order to get it with proper formatting
    inserted_order = await db.orders.find_one({"id": new_order_id_value}, {"_id": 0})

    # Update original order: keep only fulfilled items, update totalParcels
    original_order_items = order.get('items', [])

    # Create updated items list with only fulfilled parcels
    updated_items_for_original = []
    total_fulfilled_in_original = 0

    for item in original_order_items:
        fulfilled_weights = [w for w in item.get('fulfillment', []) if w is not None]
        fulfilled = len(fulfilled_weights)

        if fulfilled > 0:
            # Keep only fulfilled parcels in original order
            updated_item = {
                "productId": item['productId'],
                "alias": item['alias'],
                "category": item['category'],
                "size": item['size'],
                "printName": item['printName'],
                "quantity": fulfilled,
                "rate": item.get('rate'),
                "requireSerialNo": item.get('requireSerialNo', False),
                "fulfillment": fulfilled_weights,
            }
            if item.get('serialNumbers'):
                # Keep only fulfilled serial numbers
                updated_item['serialNumbers'] = [
                    item['serialNumbers'][i]
                    for i in range(len(item.get('fulfillment', [])))
                    if item['fulfillment'][i] is not None
                ]
            updated_items_for_original.append(updated_item)
            total_fulfilled_in_original += fulfilled

    new_original_status = "Ready" if total_fulfilled_in_original > 0 else "Pending"
    original_order_update = {
        "items": updated_items_for_original,
        "totalParcels": total_fulfilled_in_original,
        "readinessStatus": new_original_status,
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }

    # Recalculate godownDistribution for original order
    godown_dist = {}
    for item in updated_items_for_original:
        item_godown = order.get('godown', '')
        if item_godown not in godown_dist:
            godown_dist[item_godown] = 0
        godown_dist[item_godown] += item['quantity']

    original_order_update["godownDistribution"] = [
        {"godown": godown, "readyParcels": parcels}
        for godown, parcels in godown_dist.items()
    ]

    # If original order is transitioning to Ready and has no PDF yet, generate it
    old_original_status = order.get('readinessStatus', 'Pending')
    if (new_original_status == "Ready"
            and old_original_status != "Ready"
            and not order.get('billPdfUrl')):
        try:
            logging.info(f"🔄 Generating PDF for split original order {order_id} reaching Ready")
            pdf_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            custom_filename = f"{order.get('partyName', 'Order')} ({pdf_date})"

            # Build order snapshot with updated items for PDF
            order_for_pdf = {
                **order,
                'items': updated_items_for_original,
                'totalParcels': total_fulfilled_in_original,
                'readinessStatus': new_original_status,
            }
            pdf_generator = OrderPDFGenerator()
            pdf_url = pdf_generator.generate_order_bill(order_for_pdf, custom_filename)
            original_order_update["billPdfUrl"] = pdf_url
            logging.info(f"✅ PDF generated for split order: {pdf_url}")
        except Exception as e:
            logging.error(f"❌ Error generating PDF for split order {order_id}: {str(e)}", exc_info=True)

    await db.orders.update_one({"id": order_id}, {"$set": original_order_update})
    updated_original = await db.orders.find_one({"id": order_id}, {"_id": 0})

    # Notify admins and accountants about the split order
    admins = await db.users.find({"role": "admin"}, {"_id": 0}).to_list(10)
    for admin_user in admins:
        await create_notification(admin_user['id'],
            f"Order {order['orderId']} split into 2 orders. Remainder {new_order_display_id} created in {remainder_godown}",
            "order_created", new_order_id_value)

    accountants = await db.users.find({"role": "accountant"}, {"_id": 0}).to_list(10)
    for accountant_user in accountants:
        await create_notification(accountant_user['id'],
            f"Order {order['orderId']} split into 2 orders. Remainder {new_order_display_id} created in {remainder_godown}",
            "order_created", new_order_id_value)

    await create_audit_log(user['id'], "SPLIT_ORDER", order_id,
        f"Order {order['orderId']} split. Remainder: {new_order_display_id}")

    # Broadcast both updated orders
    await manager.broadcast({"type": "ORDER_UPDATED", "order": updated_original})
    await manager.broadcast({"type": "ORDER_CREATED", "order": inserted_order})

    return {"success": True, "originalOrder": updated_original, "remainderOrder": inserted_order}


@api_router.put("/orders/{order_id}/fulfill")
async def fulfill_parcel(order_id: str, req: ParcelFulfillmentRequest, user: dict = Depends(get_auth_user)):
    logger.info(f"Fulfill request: order_id={order_id}, productId={req.productId}, parcelIndex={req.parcelIndex}, weight={req.weight}")

    # Try to find order by id field
    order = await db.orders.find_one({"id": order_id})
    if not order:
        # Fallback: try orderId
        order = await db.orders.find_one({"orderId": order_id})

    if not order:
        # Final fallback: try _id as ObjectId
        try:
            order = await db.orders.find_one({"_id": ObjectId(order_id)})
        except:
            logger.warning(f"Could not parse {order_id} as ObjectId")

    if not order:
        logger.error(f"Order not found with any field matching: {order_id}")
        raise HTTPException(status_code=404, detail=f"Order not found")

    items = order.get('items', [])
    updated_items = []
    item_found = False

    for item in items:
        if item['productId'] == req.productId:
            item_found = True
            # Initialize fulfillment array if not present or None
            if not item.get('fulfillment'):
                item['fulfillment'] = [None] * item['quantity']

            # Ensure array has enough slots
            while len(item['fulfillment']) < item['quantity']:
                item['fulfillment'].append(None)

            # Update parcel weight (always save if in request)
            if req.parcelIndex < len(item['fulfillment']):
                item['fulfillment'][req.parcelIndex] = req.weight

            # Update parcel serial number (always save if in request, convert empty string to None)
            if not item.get('serialNumbers'):
                item['serialNumbers'] = [None] * item['quantity']

            while len(item['serialNumbers']) < item['quantity']:
                item['serialNumbers'].append(None)

            if req.parcelIndex < len(item['serialNumbers']):
                item['serialNumbers'][req.parcelIndex] = req.serialNo if req.serialNo and req.serialNo.strip() else None

        updated_items.append(item)

    if not item_found:
        logger.error(f"Product {req.productId} not found in order {order_id}. Available products: {[item.get('productId') for item in items]}")
        raise HTTPException(status_code=404, detail=f"Product {req.productId} not found in order")

    # Calculate status based on fulfillment
    total_parcels = order.get('totalParcels', 0)
    fulfilled_count = 0
    for item in updated_items:
        fulfilled = sum(1 for w in item.get('fulfillment', []) if w is not None)
        fulfilled_count += fulfilled

    new_status = "Pending"
    if fulfilled_count == total_parcels:
        new_status = "Ready"
    elif fulfilled_count > 0:
        new_status = "Partial Ready"

    # Check if order is transitioning to "Ready" status
    old_status = order.get('readinessStatus', 'Pending')
    is_becoming_ready = old_status != "Ready" and new_status == "Ready"

    # If becoming ready and no PDF yet, generate PDF with custom filename
    update_dict = {
        "items": updated_items,
        "readinessStatus": new_status,
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }

    if is_becoming_ready and not order.get('billPdfUrl'):
        try:
            logging.info(f"🔄 Generating PDF for order {order_id} reaching Ready status")
            # Format: "Party name (date)" e.g., "Acme Corp (2026-04-05)"
            pdf_date = datetime.now(timezone.utc).strftime('%Y-%m-%d')
            custom_filename = f"{order.get('partyName', 'Order')} ({pdf_date})"

            # Create order data with updated items for PDF generation
            order_for_pdf = {**order, 'items': updated_items}
            pdf_generator = OrderPDFGenerator()
            pdf_url = pdf_generator.generate_order_bill(order_for_pdf, custom_filename)
            update_dict["billPdfUrl"] = pdf_url
            logging.info(f"✅ PDF generated successfully for order: {pdf_url}")
        except Exception as e:
            logging.error(f"❌ Error generating PDF for order {order_id}: {str(e)}", exc_info=True)
            # Continue with order update even if PDF generation fails

    # Update order with new items and status using the _id we found
    await db.orders.update_one(
        {"_id": order["_id"]},
        {"$set": update_dict}
    )

    # Re-fetch for return and broadcast
    updated = await db.orders.find_one({"_id": order["_id"]}, {"_id": 0})
    await create_audit_log(user['id'], "PARCEL_FULFILLED", order_id,
        f"Parcel {req.parcelIndex + 1} for {req.productId} fulfilled with {req.weight}kg")
    await manager.broadcast({"type": "ORDER_UPDATED", "order": updated})
    return updated


# ─── Product Routes ───────────────────────────────────────────────────────────

@api_router.get("/products/categories")
async def get_categories(user: dict = Depends(get_auth_user)):
    categories = await db.products.distinct("category")
    # Enrich with metadata
    metas = await db.category_meta.find({}, {"_id": 0}).to_list(500)
    meta_map = {m["name"]: m for m in metas}
    result = []
    for cat in sorted(categories):
        meta = meta_map.get(cat, {})
        result.append({
            "name": cat,
            "requireSerialNo": meta.get("requireSerialNo", False),
        })
    return result


class UpdateCategoryMetaRequest(BaseModel):
    requireSerialNo: Optional[bool] = None
    newName: Optional[str] = None


@api_router.put("/products/categories/{category_name}")
async def update_category_meta(category_name: str, req: UpdateCategoryMetaRequest, user: dict = Depends(get_auth_user)):
    require_admin(user)
    update_meta: dict = {}
    if req.requireSerialNo is not None:
        update_meta["requireSerialNo"] = req.requireSerialNo
    if req.newName and req.newName.strip() and req.newName.strip() != category_name:
        new_name = req.newName.strip()
        # Rename all products in this category
        await db.products.update_many({"category": category_name}, {"$set": {"category": new_name}})
        # Update old meta doc name
        await db.category_meta.delete_one({"name": category_name})
        category_name = new_name
    await db.category_meta.update_one(
        {"name": category_name},
        {"$set": {**update_meta, "name": category_name}},
        upsert=True
    )
    return {"name": category_name, **update_meta}


@api_router.get("/products")
async def get_products(
    user: dict = Depends(get_auth_user),
    category: Optional[str] = None,
    search: Optional[str] = None
):
    query = {}
    if category:
        query["category"] = category
    if search:
        query["$or"] = [
            {"category": {"$regex": search, "$options": "i"}},
            {"size": {"$regex": search, "$options": "i"}},
            {"printName": {"$regex": search, "$options": "i"}},
            {"alias": {"$regex": search, "$options": "i"}}
        ]
    products = await db.products.find(query, {"_id": 0}).sort("category", 1).to_list(1000)
    return products


@api_router.post("/products")
async def create_product(req: CreateProductRequest, user: dict = Depends(get_auth_user)):
    require_admin(user)
    existing = await db.products.find_one({"alias": req.alias})
    if existing:
        raise HTTPException(status_code=400, detail="Product alias already exists")
    product = {
        "id": str(uuid.uuid4()),
        "category": req.category,
        "size": req.size,
        "printName": req.printName,
        "alias": req.alias,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one({**product})
    await create_audit_log(user['id'], "PRODUCT_CREATED", None, f"Created product {req.alias}")
    return product


@api_router.get("/products/{product_id}")
async def get_product(product_id: str, user: dict = Depends(get_auth_user)):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@api_router.put("/products/{product_id}")
async def update_product(product_id: str, req: UpdateProductRequest, user: dict = Depends(get_auth_user)):
    require_admin(user)
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    update = {"updatedAt": datetime.now(timezone.utc).isoformat()}
    if req.category is not None:
        update["category"] = req.category
    if req.size is not None:
        update["size"] = req.size
    if req.printName is not None:
        update["printName"] = req.printName
    if req.alias is not None:
        update["alias"] = req.alias
    await db.products.update_one({"id": product_id}, {"$set": update})
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    await create_audit_log(user['id'], "PRODUCT_UPDATED", None, f"Updated product {product['alias']}")
    return updated


@api_router.delete("/products/{product_id}")
async def delete_product(product_id: str, user: dict = Depends(get_auth_user)):
    require_admin(user)
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    await db.products.delete_one({"id": product_id})
    await create_audit_log(user['id'], "PRODUCT_DELETED", None, f"Deleted product {product['alias']}")
    return {"message": "Product deleted"}


# ─── Gowdown Routes ──────────────────────────────────────────────────────────

@api_router.get("/gowdowns")
async def get_gowdowns(user: dict = Depends(get_auth_user)):
    gowdowns = await db.gowdowns.find({}, {"_id": 0}).to_list(100)
    return gowdowns


# ─── Notification Routes ─────────────────────────────────────────────────────

@api_router.get("/notifications")
async def get_notifications(user: dict = Depends(get_auth_user)):
    notifs = await db.notifications.find(
        {"userId": user['id']}, {"_id": 0}
    ).sort("createdAt", -1).to_list(100)
    return notifs


@api_router.get("/notifications/unread-count")
async def get_unread_count(user: dict = Depends(get_auth_user)):
    count = await db.notifications.count_documents({"userId": user['id'], "read": False})
    return {"count": count}


@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str, user: dict = Depends(get_auth_user)):
    await db.notifications.update_one(
        {"id": notification_id, "userId": user['id']},
        {"$set": {"read": True}}
    )
    return {"message": "Marked as read"}


@api_router.put("/notifications/read-all")
async def mark_all_read(user: dict = Depends(get_auth_user)):
    await db.notifications.update_many(
        {"userId": user['id'], "read": False},
        {"$set": {"read": True}}
    )
    return {"message": "All marked as read"}


# ─── Dashboard & Audit ────────────────────────────────────────────────────────

@api_router.get("/dashboard/stats")
async def get_dashboard_stats(user: dict = Depends(get_auth_user)):
    user_role = user.get('role', 'staff')
    non_completed = {"completed": {"$ne": True}}

    if user_role == 'admin':
        # Admin: active = all non-completed
        total_active = await db.orders.count_documents(non_completed)
        pending = await db.orders.count_documents({**non_completed, "readinessStatus": "Pending"})
        partial = await db.orders.count_documents({**non_completed, "readinessStatus": "Partial Ready"})
        ready = await db.orders.count_documents({**non_completed, "readinessStatus": "Ready"})
        dispatched = await db.orders.count_documents({**non_completed, "dispatched": True, "readinessStatus": {"$ne": "Bill Generated"}})
        bill_generated = await db.orders.count_documents({**non_completed, "readinessStatus": "Bill Generated"})
        completed = await db.orders.count_documents({"completed": True})
        return {
            "totalActive": total_active,
            "pending": pending,
            "partialReady": partial,
            "ready": ready,
            "dispatched": dispatched,
            "billGenerated": bill_generated,
            "completed": completed,
        }
    elif user_role == 'accountant':
        # Accountant: active = dispatched orders without bill
        dispatched_no_bill = await db.orders.count_documents({
            **non_completed, "dispatched": True,
            "$or": [{"billNo": None}, {"billNo": {"$exists": False}}, {"billNo": ""}]
        })
        bill_generated = await db.orders.count_documents({**non_completed, "readinessStatus": "Bill Generated"})
        return {
            "totalActive": dispatched_no_bill,
            "needsBill": dispatched_no_bill,
            "billGenerated": bill_generated,
        }
    else:
        # Staff: active = pending + partial + ready (non-dispatched)
        base = {"dispatched": False, **non_completed}
        total = await db.orders.count_documents(base)
        pending = await db.orders.count_documents({**base, "readinessStatus": "Pending"})
        partial = await db.orders.count_documents({**base, "readinessStatus": "Partial Ready"})
        ready = await db.orders.count_documents({**base, "readinessStatus": "Ready"})
        return {
            "totalActive": total,
            "pending": pending,
            "partialReady": partial,
            "ready": ready,
        }


@api_router.get("/audit-logs")
async def get_audit_logs(user: dict = Depends(get_auth_user), limit: int = 50):
    require_admin(user)
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("timestamp", -1).to_list(limit)
    return logs


# ─── WebSocket ────────────────────────────────────────────────────────────────

@api_router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query("")):
    if not token:
        logger.warning("WebSocket connection rejected: no token provided")
        await websocket.close(code=4001)
        return
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload['userId']}, {"_id": 0})
        if not user:
            logger.warning(f"WebSocket connection rejected: user not found {payload.get('userId')}")
            await websocket.close(code=4001)
            return
    except jwt.ExpiredSignatureError:
        logger.warning("WebSocket connection rejected: token expired")
        await websocket.close(code=4001)
        return
    except jwt.InvalidTokenError as e:
        logger.warning(f"WebSocket connection rejected: invalid token - {str(e)}")
        await websocket.close(code=4001)
        return
    except Exception as e:
        logger.error(f"WebSocket connection error: {str(e)}")
        await websocket.close(code=4001)
        return

    logger.info(f"WebSocket connection accepted for user {user['id']}")
    await manager.connect(websocket, user['id'])
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(user['id'])
    except Exception as e:
        logger.error(f"WebSocket error for user {user['id']}: {str(e)}")
        manager.disconnect(user['id'])


# ─── Startup ──────────────────────────────────────────────────────────────────

async def seed_products_from_xlsx():
    """Load and seed products from ListofItems.xlsx if not already seeded."""
    try:
        import openpyxl
        xlsx_path = Path(__file__).parent.parent / 'ListofItems.xlsx'

        if not xlsx_path.exists():
            logger.warning(f"ListofItems.xlsx not found at {xlsx_path}")
            return

        wb = openpyxl.load_workbook(xlsx_path)
        ws = wb['Sheet1']

        products = []
        for row in range(4, ws.max_row + 1):
            category = ws.cell(row, 1).value
            size = ws.cell(row, 2).value
            print_name = ws.cell(row, 3).value
            alias = ws.cell(row, 4).value

            if not category or not size or not alias:
                continue

            products.append({
                "id": str(uuid.uuid4()),
                "category": str(category).strip(),
                "size": str(size).strip(),
                "printName": str(print_name).strip() if print_name else "",
                "alias": str(alias).strip(),
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "updatedAt": datetime.now(timezone.utc).isoformat(),
            })

        if products:
            # Use upsert to avoid duplicates
            for product in products:
                await db.products.update_one(
                    {"alias": product["alias"]},
                    {"$set": product},
                    upsert=True
                )
            logger.info(f"Seeded {len(products)} products from xlsx")
    except Exception as e:
        logger.warning(f"Failed to seed products: {e}")


@app.on_event("startup")
async def startup():
    await db.orders.create_index("orderId")
    await db.orders.create_index("createdAt")
    await db.orders.create_index("dispatched")
    await db.users.create_index("phone", unique=True)
    await db.notifications.create_index([("userId", 1), ("createdAt", -1)])
    await db.products.create_index("category")
    await db.products.create_index("alias", unique=True)

    # Product seeding disabled - use manual import for original data
    product_count = await db.products.count_documents({})
    logger.info(f"Products in database: {product_count}")

    # Seed gowdowns
    gowdowns = ["Sundha", "Lal-Shivnagar"]
    for gowdown_name in gowdowns:
        existing = await db.gowdowns.find_one({"name": gowdown_name})
        if not existing:
            await db.gowdowns.insert_one({
                "id": str(uuid.uuid4()),
                "name": gowdown_name,
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "updatedAt": datetime.now(timezone.utc).isoformat()
            })
    logger.info("Gowdowns seeded successfully")

    counter = await db.counters.find_one({"name": "orderId"})
    if not counter:
        await db.counters.insert_one({"name": "orderId", "value": 0})
    logger.info("Database seeded successfully")


app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
