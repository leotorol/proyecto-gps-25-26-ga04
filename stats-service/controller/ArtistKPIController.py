from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import io, csv, os
import httpx

from config.db import get_db
from model.dao.EventDAO import EventDAO
from model.dao.ArtistKPIDAO import ArtistKPIDAO

router = APIRouter()

CONTENT_SERVICE_URL = os.getenv("CONTENT_SERVICE_URL")

# GET /stats/artist/{artistId}/kpis
@router.get("/stats/artist/{artistId}/kpis")
async def get_artist_kpis(artistId: str, startDate: Optional[str] = None, endDate: Optional[str] = None):
    try:
        start = datetime.fromisoformat(startDate) if startDate else None
        end = datetime.fromisoformat(endDate) if endDate else None
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format (ISO)")

    if start or end:
        agg = await EventDAO.aggregate_for_artist(artistId, start, end)
        return {
            "artistId": artistId,
            "plays": int(agg.get("plays", 0)),
            "likes": int(agg.get("likes", 0)),
            "follows": int(agg.get("follows", 0)),
            "purchases": int(agg.get("purchases", 0)),
            "revenue": float(agg.get("revenue", 0.0))
        }
    doc = await ArtistKPIDAO.get_by_artist(artistId)
    if not doc:
        return {"artistId": artistId, "plays": 0, "likes": 0, "follows": 0, "purchases": 0, "revenue": 0.0}
    # ensure numeric types
    return {
        "artistId": doc.get("artistId"),
        "plays": int(doc.get("plays", 0)),
        "likes": int(doc.get("likes", 0)),
        "follows": int(doc.get("follows", 0)),
        "purchases": int(doc.get("purchases", 0)),
        "revenue": float(doc.get("revenue", 0.0))
    }

# GET /stats/top
@router.get("/stats/top")
async def get_top(type: str = Query(..., regex="^(track|album|artist)$"), period: str = "week", limit: int = 10):
    days_map = {"day":1, "week":7, "month":30, "year":365}
    since = datetime.utcnow() - timedelta(days=days_map.get(period, 7))
    rows = await EventDAO.aggregate_by_entity(type, since=since, limit=limit)
    results = []
    async with httpx.AsyncClient() as client:
        for r in rows:
            eid = r.get("_id")
            title = None
            try:
                if type == "artist":
                    resp = await client.get(f"{CONTENT_SERVICE_URL}/artists/{eid}", timeout=5)
                    if resp.status_code == 200:
                        title = resp.json().get("name") or resp.json().get("titulo") or None
                elif type == "album":
                    resp = await client.get(f"{CONTENT_SERVICE_URL}/albums/{eid}", timeout=5)
                    if resp.status_code == 200:
                        title = resp.json().get("title") or resp.json().get("name")
            except Exception:
                pass
            results.append({"id": eid, "type": type, "title": title, "metricValue": r.get("count", 0)})
    return results

# GET /stats/trending
@router.get("/stats/trending")
async def get_trending(genre: Optional[str] = None, period: str = "week", limit: int = 10):
    days_map = {"day":1, "week":7, "month":30}
    since = datetime.utcnow() - timedelta(days=days_map.get(period,7))
    match = {"timestamp": {"$gte": since}}
    if genre:
        match["metadata.genre"] = genre
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$metadata.genre", "score": {"$sum": 1}}},
        {"$sort": {"score": -1}},
        {"$limit": limit}
    ]
    db = get_db()
    rows = await db["events"].aggregate(pipeline).to_list(length=limit)
    trends = []
    for r in rows:
        trends.append({"genre": r.get("_id"), "score": r.get("score", 0), "topItems": []})
    return {"period": period, "trends": trends}

# GET /stats/export
@router.get("/stats/export")
async def export_metrics(type: str = "plays", startDate: Optional[str] = None, endDate: Optional[str] = None, format: str = "csv"):
    match = {}
    try:
        if startDate:
            match.setdefault("timestamp", {})["$gte"] = datetime.fromisoformat(startDate)
        if endDate:
            match.setdefault("timestamp", {})["$lte"] = datetime.fromisoformat(endDate)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format")
    pipeline = []
    if match:
        pipeline.append({"$match": match})
    pipeline.append({"$group": {"_id": "$entityId", "count": {"$sum": 1}}})
    db = get_db()
    rows = await db["events"].aggregate(pipeline).to_list(length=10000)
    if format == "json":
        return rows
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id","count"])
    for r in rows:
        writer.writerow([r.get("_id"), r.get("count")])
    return buf.getvalue()

# GET /recommendations/user/{userId}
@router.get("/recommendations/user/{userId}")
async def recommend_for_user(userId: str, limit: int = 20):
    # heurística: géneros preferidos por likes/plays
    pipeline = [
        {"$match": {"userId": userId, "eventType": {"$in": ["track.liked","track.played"]}}},
        {"$group": {"_id": "$metadata.genre", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5}
    ]
    db = get_db()
    rows = await db["events"].aggregate(pipeline).to_list(length=5)
    genres = [r.get("_id") for r in rows if r.get("_id")]
    results = []
    async with httpx.AsyncClient() as client:
        for g in genres:
            try:
                resp = await client.get(f"{CONTENT_SERVICE_URL}/albums?genre={g}&limit={limit}", timeout=5)
                if resp.status_code == 200:
                    for it in resp.json()[:limit]:
                        results.append({"id": it.get("_id") or it.get("id"), "type": "album", "reason": f"genre:{g}", "score": 1.0})
            except Exception:
                pass
    # fallback: top artists
    if not results:
        top = await EventDAO.aggregate_by_entity("artist", since=None, limit=limit)
        for t in top:
            results.append({"id": t.get("_id"), "type": "artist", "reason": "popular", "score": t.get("count",0)})
    return results[:limit]

# GET /recommendations/similar
@router.get("/recommendations/similar")
async def recommend_similar(type: str = Query(..., regex="^(artist|album|track)$"), id: str = Query(...), limit: int = 10):
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.get(f"{CONTENT_SERVICE_URL}/{type}s/{id}", timeout=5)
            if resp.status_code != 200:
                raise HTTPException(status_code=404, detail="Entity not found")
            genre = resp.json().get("genre")
            if not genre:
                return []
            resp2 = await client.get(f"{CONTENT_SERVICE_URL}/{type}s?genre={genre}&limit={limit}", timeout=5)
            if resp2.status_code == 200:
                return [{"id": it.get("_id") or it.get("id"), "type": type, "reason": "same_genre", "score": 1.0} for it in resp2.json()[:limit]]
        except httpx.HTTPError:
            raise HTTPException(status_code=502, detail="Content service error")
    return []

# POST /recommendations/refresh
@router.post("/recommendations/refresh", status_code=202)
async def refresh_recommendations(payload: Dict[str, Any]):
    # simple trigger endpoint; actual recompute job can be implemented later
    job_id = f"job-{int(datetime.utcnow().timestamp())}"
    # could spawn background worker or set a DB flag; here we just acknowledge
    return {"accepted": True, "jobId": job_id}