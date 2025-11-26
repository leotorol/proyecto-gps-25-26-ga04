from fastapi import APIRouter, Request, BackgroundTasks, HTTPException
from typing import Any, Dict
from datetime import datetime
import os
import httpx

from model.factory.EventFactory import EventFactory
from model.dao.EventDAO import EventDAO
from model.dao.ArtistKPIDAO import ArtistKPIDAO
from config.db import get_db
from controller.ArtistKPIController import notify_artist_alert

router = APIRouter()

async def _process_event_for_kpis(event: Dict[str, Any]):
    et = event.get("eventType")
    meta = event.get("metadata") or {}
    artist_id = event.get("entityId") or meta.get("artistId") or meta.get("artist")
    if not artist_id:
        return
    if et == "track.played":
        await ArtistKPIDAO.upsert_increment(str(artist_id), {"plays": 1})
    elif et == "track.liked":
        await ArtistKPIDAO.upsert_increment(str(artist_id), {"likes": 1})
    elif et == "artist.followed":
        await ArtistKPIDAO.upsert_increment(str(artist_id), {"follows": 1})
    elif et == "order.paid":
        price = float(meta.get("price", 0) or 0)
        await ArtistKPIDAO.upsert_increment(str(artist_id), {"purchases": 1, "revenue": price})

#tarea GA04-29-H12.2 legada
# POST /stats/events
@router.post("/stats/events", status_code=202)
async def ingest_event(request: Request, background_tasks: BackgroundTasks):
    payload = await request.json()
    if not payload or "eventType" not in payload or "timestamp" not in payload:
        raise HTTPException(status_code=400, detail="Invalid event payload")
    try:
        event_model = EventFactory.create(payload)
        inserted_id = await EventDAO.insert_event(event_model.dict())
        # process KPIs in background
        background_tasks.add_task(_process_event_for_kpis, event_model.dict())

        # schedule an alert check in background for relevant events (non-blocking)
        try:
            et = payload.get("eventType")
            if et in ("track.played", "track.liked", "artist.followed"):
                meta = payload.get("metadata") or {}
                artist_id = payload.get("entityId") or meta.get("artistId") or meta.get("artist")
                if artist_id:
                    background_tasks.add_task(notify_artist_alert, str(artist_id))
        except Exception:
            # keep ingestion robust: swallow alert-scheduling errors
            pass

        return {"accepted": True, "id": inserted_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))