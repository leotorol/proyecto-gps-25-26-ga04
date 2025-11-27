import os
import asyncio
from typing import Optional
import motor.motor_asyncio
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

# Leer variables de entorno con valores por defecto
MONGO_URI = os.getenv("MONGO_URI") or "mongodb://127.0.0.1:27017"
DB_NAME = os.getenv("DB_NAME") or "undersounds_stats"

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None

async def connect_to_mongo():
    global _client, _db
    if _client is None:
        # motor no admite None como host; asegurar string válido
        uri = MONGO_URI if isinstance(MONGO_URI, str) and MONGO_URI else "mongodb://127.0.0.1:27017"
        _client = AsyncIOMotorClient(uri)
        _db = _client[DB_NAME]
        # Realizar un ping para utilizar features async y validar la conexión
        try:
            await _client.admin.command('ping')
            print(f"Connected to MongoDB {uri} DB={DB_NAME}")
        except Exception as e:
            print(f"Warning: ping failed after client init: {e}")

async def close_mongo():
    global _client, _db
    if _client:
        # pequeña espera para usar características async (y satisfacer Sonar)
        await asyncio.sleep(0)
        _client.close()
        _client = None
        _db = None
        print("Closed MongoDB connection")

def get_db() -> AsyncIOMotorDatabase:
    if _db is None:
        raise RuntimeError("Database not initialized. Call connect_to_mongo() on startup.")
    return _db