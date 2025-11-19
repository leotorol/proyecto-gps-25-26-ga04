from typing import Dict, Any, Optional
from config.db import get_db

class ArtistKPIDAO:
    COLLECTION = "artist_kpis"

    @staticmethod
    async def get_by_artist(artist_id: str) -> Optional[Dict[str, Any]]:
        db = get_db()
        return await db[ArtistKPIDAO.COLLECTION].find_one({"artistId": str(artist_id)})

    @staticmethod
    async def upsert_increment(artist_id: str, increments: Dict[str, Any]):
        db = get_db()
        update = {"$inc": {}, "$setOnInsert": {"artistId": str(artist_id)}}
        for k, v in increments.items():
            update["$inc"][k] = v
        await db[ArtistKPIDAO.COLLECTION].update_one({"artistId": str(artist_id)}, update, upsert=True)
        return await ArtistKPIDAO.get_by_artist(artist_id)