from fastapi import FastAPI, APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Depends, Header, Query
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
from products_data import PRODUCTS_DATA

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

class UpdateOrderRequest(BaseModel):
    partyName: Optional[str] = None
    location: Optional[str] = None
    godown: Optional[str] = None
    message: Optional[str] = None
    totalParcels: Optional[int] = None
    items: Optional[List[OrderProductItem]] = None

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
    weight: float

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

# ─── Notification & Audit Helpers ─────────────────────────────────────────────

async def create_notification(user_id: str, message: str, ntype: str, order_id: str = None):
    notif = {
        "id": str(uuid.uuid4()),
        "userId": user_id,
        "message": message,
        "type": ntype,
        "orderId": order_id,
        "read": False,
        "createdAt": datetime.now(timezone.utc).isoformat()
    }
    await db.notifications.insert_one({**notif})
    await manager.send_to_user(user_id, {"type": "NOTIFICATION", "notification": notif})
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
    return {"message": "OTP sent successfully", "mock_otp": MOCK_OTP}


@api_router.post("/auth/verify-otp")
async def verify_otp(req: VerifyOTPRequest):
    user = await db.users.find_one({"phone": req.phone}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if req.otp != MOCK_OTP:
        stored = await db.otp_store.find_one({"phone": req.phone})
        if not stored or stored.get('otp') != req.otp:
            raise HTTPException(status_code=400, detail="Invalid OTP")
    token = create_token(user)
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
    godown: Optional[str] = None
):
    conditions = []
    two_days_ago = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    conditions.append({
        "$or": [
            {"dispatched": False},
            {"dispatched": True, "dispatchedAt": {"$gte": two_days_ago}}
        ]
    })
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
async def toggle_dispatch(order_id: str, user: dict = Depends(get_auth_user)):
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    new_val = not order.get('dispatched', False)

    # If dispatching (setting to True), check for partial fulfillment
    if new_val:
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
                    "rate": item.get('rate')
                })

        # If there are remaining items, create a new order
        if remaining_items:
            new_order_id = f"{order['orderId']}-REM-{datetime.now(timezone.utc).strftime('%s')}"
            new_order = {
                "id": new_order_id,
                "orderId": new_order_id,
                "partyName": order['partyName'],
                "location": order.get('location', ''),
                "godown": order['godown'],
                "message": f"Remaining parcels from {order['orderId']}",
                "totalParcels": sum(item['quantity'] for item in remaining_items),
                "items": remaining_items,
                "readinessStatus": "Pending",
                "dispatched": False,
                "dispatchedAt": None,
                "createdByName": "System",
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "updatedAt": datetime.now(timezone.utc).isoformat(),
                "godownDistribution": []
            }

            # Insert the new order
            await db.orders.insert_one(new_order)

            # Notify admins about the new order
            admins = await db.users.find({"role": "admin"}, {"_id": 0}).to_list(10)
            for admin_user in admins:
                await create_notification(admin_user['id'],
                    f"System created remainder order {new_order_id} for {order['partyName']} (from {order['orderId']})",
                    "order_created", new_order_id)

    update_data = {
        "dispatched": new_val,
        "updatedAt": datetime.now(timezone.utc).isoformat()
    }
    if new_val:
        update_data["dispatchedAt"] = datetime.now(timezone.utc).isoformat()
    await db.orders.update_one({"id": order_id}, {"$set": update_data})
    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    await create_audit_log(user['id'], "DISPATCH_UPDATED", order_id,
        f"Order {order['orderId']} {'dispatched' if new_val else 'un-dispatched'}")
    if new_val:
        admins = await db.users.find({"role": "admin"}, {"_id": 0}).to_list(10)
        for admin_user in admins:
            await create_notification(admin_user['id'],
                f"Order {order['orderId']} has been dispatched!",
                "order_dispatched", order['id'])
    await manager.broadcast({"type": "ORDER_UPDATED", "order": updated})
    return updated


@api_router.put("/orders/{order_id}/fulfill")
async def fulfill_parcel(order_id: str, req: ParcelFulfillmentRequest, user: dict = Depends(get_auth_user)):
    logger.info(f"Fulfill request: order_id={order_id}, productId={req.productId}, parcelIndex={req.parcelIndex}, weight={req.weight}")

    # Try to find order by id field
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        # Fallback: try orderId
        order = await db.orders.find_one({"orderId": order_id}, {"_id": 0})

    if not order:
        # Final fallback: try _id as ObjectId
        try:
            order = await db.orders.find_one({"_id": ObjectId(order_id)}, {"_id": 0})
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
            # Initialize fulfillment array if not present
            if 'fulfillment' not in item:
                item['fulfillment'] = [None] * item['quantity']

            # Ensure array has enough slots
            while len(item['fulfillment']) < item['quantity']:
                item['fulfillment'].append(None)

            # Update parcel weight
            if req.parcelIndex < len(item['fulfillment']):
                item['fulfillment'][req.parcelIndex] = req.weight

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

    # Update order with new items and status
    await db.orders.update_one(
        {"id": order_id},
        {"$set": {
            "items": updated_items,
            "readinessStatus": new_status,
            "updatedAt": datetime.now(timezone.utc).isoformat()
        }}
    )

    updated = await db.orders.find_one({"id": order_id}, {"_id": 0})
    await create_audit_log(user['id'], "PARCEL_FULFILLED", order_id,
        f"Parcel {req.parcelIndex + 1} for {req.productId} fulfilled with {req.weight}kg")
    await manager.broadcast({"type": "ORDER_UPDATED", "order": updated})
    return updated


# ─── Product Routes ───────────────────────────────────────────────────────────

@api_router.get("/products/categories")
async def get_categories(user: dict = Depends(get_auth_user)):
    categories = await db.products.distinct("category")
    return sorted(categories)


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
    total = await db.orders.count_documents({"dispatched": False})
    ready = await db.orders.count_documents({"readinessStatus": "Ready", "dispatched": False})
    partial = await db.orders.count_documents({"readinessStatus": "Partial Ready", "dispatched": False})
    pending = await db.orders.count_documents({"readinessStatus": "Pending", "dispatched": False})
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    dispatched_today = await db.orders.count_documents({
        "dispatched": True,
        "dispatchedAt": {"$gte": today_start}
    })
    return {
        "totalActive": total,
        "ready": ready,
        "partialReady": partial,
        "pending": pending,
        "dispatchedToday": dispatched_today
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
        await websocket.close(code=4001)
        return
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload['userId']}, {"_id": 0})
        if not user:
            await websocket.close(code=4001)
            return
    except Exception:
        await websocket.close(code=4001)
        return
    await manager.connect(websocket, user['id'])
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(user['id'])
    except Exception:
        manager.disconnect(user['id'])


# ─── Startup ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    await db.orders.create_index("orderId")
    await db.orders.create_index("createdAt")
    await db.orders.create_index("dispatched")
    await db.users.create_index("phone", unique=True)
    await db.notifications.create_index([("userId", 1), ("createdAt", -1)])
    await db.products.create_index("category")
    await db.products.create_index("alias", unique=True)

    # Seed products from PRODUCTS_DATA
    products_data = [
        {
            "category": category,
            "size": size,
            "printName": printName,
            "alias": alias
        }
        for category, size, printName, alias in PRODUCTS_DATA
    ]

    for prod in products_data:
        existing = await db.products.find_one({"alias": prod["alias"]})
        if not existing:
            product_doc = {
                "id": str(uuid.uuid4()),
                "category": prod["category"],
                "size": prod["size"],
                "printName": prod["printName"],
                "alias": prod["alias"],
                "createdAt": datetime.now(timezone.utc).isoformat(),
                "updatedAt": datetime.now(timezone.utc).isoformat()
            }
            await db.products.insert_one(product_doc)

    logger.info("Products seeded successfully")

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

    # Seed admin users
    admin1 = await db.users.find_one({"phone": "+919999999901"})
    if not admin1:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "phone": "+919999999901",
            "firstName": "Kishor", "lastName": "Owner",
            "role": "admin", "createdAt": datetime.now(timezone.utc).isoformat()
        })
    admin2 = await db.users.find_one({"phone": "+919999999902"})
    if not admin2:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "phone": "+919999999902",
            "firstName": "Father", "lastName": "Admin",
            "role": "admin", "createdAt": datetime.now(timezone.utc).isoformat()
        })
    staff1 = await db.users.find_one({"phone": "+919999999903"})
    if not staff1:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "phone": "+919999999903",
            "firstName": "Raju", "lastName": "Worker",
            "role": "staff", "createdAt": datetime.now(timezone.utc).isoformat()
        })
    admin3 = await db.users.find_one({"phone": "+919909667752"})
    if not admin3:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "phone": "+919909667752",
            "firstName": "Admin", "lastName": "User",
            "role": "admin", "createdAt": datetime.now(timezone.utc).isoformat()
        })
    counter = await db.counters.find_one({"name": "orderId"})
    if not counter:
        await db.counters.insert_one({"name": "orderId", "value": 0})
    logger.info("Database seeded successfully")


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
