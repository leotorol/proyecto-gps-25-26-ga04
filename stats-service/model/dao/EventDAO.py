from typing import Dict, Any, List, Optional
from bson import ObjectId
from config.db import get_db
import datetime

EVENT_TYPE_FIELD = "$eventType"
METADATA_PRICE_FIELD = "$metadata.price"
COND = "$cond"
EQ = "$eq"

def _sanitize_doc(doc: dict) -> dict:
    """Elimina operadores MongoDB maliciosos de un documento."""
    if not isinstance(doc, dict):
        return doc
    clean = {}
    for k, v in doc.items():
        if k.startswith('$'):
            continue  # Silenciosamente ignorar
        if isinstance(v, dict):
            clean[k] = _sanitize_doc(v)
        elif isinstance(v, list):
            clean[k] = [_sanitize_doc(i) if isinstance(i, dict) else i for i in v]
        else:
            clean[k] = v
    return clean

def _cond_eq_event(event_name: str, true_value=1, false_value=0):
    return {COND: [{EQ: [EVENT_TYPE_FIELD, event_name]}, true_value, false_value]}

class EventDAO:
    COLLECTION = "events"

    @staticmethod
    async def insert_event(doc: Dict[str, Any]) -> str:
        db = get_db()
        res = await db[EventDAO.COLLECTION].insert_one(_sanitize_doc(doc))
        return str(res.inserted_id)

    @staticmethod
    async def aggregate_by_entity(entity_type: str, since: Optional[datetime.datetime] = None, limit: int = 10):
        db = get_db()
        match = {"entityType": entity_type}
        if since:
            match["timestamp"] = {"$gte": since}
        pipeline = [
            {"$match": match},
            {"$group": {"_id": "$entityId", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": limit}
        ]
        return await db[EventDAO.COLLECTION].aggregate(pipeline).to_list(length=limit)

    @staticmethod
    async def aggregate_for_artist(artist_id: str, start: Optional[datetime.datetime]=None, end: Optional[datetime.datetime]=None):
        db = get_db()
        match = {
            "$or": [
                {"entityId": artist_id},
                {"metadata.artistId": artist_id},
                {"metadata.artist": artist_id}
            ]
        }
        if start or end:
            match["timestamp"] = {}
            if start:
                match["timestamp"]["$gte"] = start
            if end:
                match["timestamp"]["$lte"] = end

        pipeline = [
            {"$match": match},
            {"$group": {
                "_id": None,
                "plays": {"$sum": _cond_eq_event("track.played")},
                "likes": {"$sum": _cond_eq_event("track.liked")},
                "follows": {"$sum": _cond_eq_event("artist.followed")},
                "purchases": {"$sum": _cond_eq_event("order.paid")},
                "revenue": {"$sum": {COND: [{EQ: [EVENT_TYPE_FIELD, "order.paid"]}, METADATA_PRICE_FIELD, 0]}}
            }}
        ]
        rows = await db[EventDAO.COLLECTION].aggregate(pipeline).to_list(length=1)
        return rows[0] if rows else {}