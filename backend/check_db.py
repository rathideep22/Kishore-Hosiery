import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()
async def run():
    client = AsyncIOMotorClient(os.environ.get("MONGODB_URL"))
    db = client[os.environ.get('DB_NAME', 'kishore_hosiery')]
    orders = await db.orders.find({"dispatched": True}).to_list(10)
    for o in orders:
        print(o.get('orderId'), "Dispatched:", o.get('dispatched'), "dispatchNote:", o.get('dispatchNote', 'NOT FOUND'))

asyncio.run(run())
