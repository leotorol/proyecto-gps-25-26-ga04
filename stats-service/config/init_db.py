import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(str(BASE_DIR / ".env"))
MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27017")
DB_NAME = os.getenv("DB_NAME", "undersounds_stats")

async def ensure_collection(db, name):
    try:
        await db.create_collection(name)
        print(f"Created collection: {name}")
    except Exception:
        print(f"Collection already exists or failed to create: {name}")

async def main():
    client = AsyncIOMotorClient(MONGO_URI)
    db = client[DB_NAME]
    await ensure_collection(db, "events")
    await ensure_collection(db, "artist_kpis")
    # crear índices recomendados
    await db["events"].create_index([("timestamp", 1)])
    await db["events"].create_index([("entityId", 1)])
    await db["artist_kpis"].create_index([("artistId", 1)], unique=True)
    # cerrar cliente (motor.close() no es awaitable)
    client.close()
    print("Init finished")

if __name__ == "__main__":
    asyncio.run(main())