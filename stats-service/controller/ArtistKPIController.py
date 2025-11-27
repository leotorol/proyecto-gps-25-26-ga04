from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any, Callable, Coroutine
from datetime import datetime, timedelta, timezone
import io, csv, os
import httpx
import time
import asyncio
import smtplib
import logging

from email.message import EmailMessage
from aiobreaker import CircuitBreaker, CircuitBreakerError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from cachetools import TTLCache
from config.db import get_db
from model.dao.EventDAO import EventDAO
from model.dao.ArtistKPIDAO import ArtistKPIDAO

logger = logging.getLogger(__name__)

router = APIRouter()

CONTENT_SERVICE_URL = os.getenv("CONTENT_SERVICE_URL")
_SMTP_HOST = os.getenv("SMTP_HOST")
_SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
_SMTP_USER = os.getenv("SMTP_USER")
_SMTP_PASS = os.getenv("SMTP_PASS")
_FROM_EMAIL = os.getenv("FROM_EMAIL")

# ============================================================
# CONSTANTES PARA LITERALES DUPLICADOS (S1192)
# ============================================================
MATCH = "$match"
GROUP = "$group"
SORT = "$sort"
LIMIT_OP = "$limit"
ENTITY_ID = "$entityId"
EVENT_TRACK_PLAYED = "track.played"
EVENT_TRACK_LIKED = "track.liked"
EVENT_ARTIST_FOLLOWED = "artist.followed"
EVENT_ORDER_PAID = "order.paid"

# ============================================================
# FUNCIONES AUXILIARES PARA PIPELINES (S3776)
# ============================================================
def _build_track_pipeline(since: datetime, limit: int) -> list:
    return [
        {MATCH: {"timestamp": {"$gte": since}, "eventType": EVENT_TRACK_PLAYED}},
        {GROUP: {"_id": ENTITY_ID, "count": {"$sum": 1}, "albumId": {"$first": "$metadata.albumId"}}},
        {SORT: {"count": -1}},
        {LIMIT_OP: limit}
    ]

def _build_artist_pipeline(since: datetime, limit: int) -> list:
    return [
        {MATCH: {"timestamp": {"$gte": since}, "eventType": EVENT_ARTIST_FOLLOWED}},
        {GROUP: {"_id": ENTITY_ID, "count": {"$sum": 1}}},
        {SORT: {"count": -1}},
        {LIMIT_OP: limit}
    ]

def _build_user_genre_pipeline(user_id: str) -> list:
    return [
        {MATCH: {"userId": user_id, "eventType": {"$in": [EVENT_TRACK_LIKED, EVENT_TRACK_PLAYED]}}},
        {GROUP: {"_id": "$metadata.genre", "count": {"$sum": 1}}},
        {SORT: {"count": -1}},
        {LIMIT_OP: 5}
    ]

def _build_export_pipeline(match_filter: dict) -> list:
    pipeline = []
    if match_filter:
        pipeline.append({MATCH: match_filter})
    pipeline.append({GROUP: {"_id": ENTITY_ID, "count": {"$sum": 1}}})
    pipeline.append({SORT: {"count": -1}})
    return pipeline

def _get_days_from_period(period: str) -> int:
    days_map = {"day": 1, "week": 7, "month": 30, "year": 365}
    return days_map.get(period, 7)

# ============================================================
# EMAIL
# ============================================================
def _send_email_sync(to_email: str, subject: str, plain_text: str, html: str = None):
    msg = EmailMessage()
    msg["From"] = _FROM_EMAIL
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(plain_text or "")
    if html:
        msg.add_alternative(html, subtype="html")

    with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT, timeout=15) as s:
        s.ehlo()
        s.starttls()
        s.ehlo()
        s.login(_SMTP_USER, _SMTP_PASS)
        s.send_message(msg)

async def send_email_async(to_email: str, subject: str, plain_text: str, html: str = None):
    await asyncio.to_thread(_send_email_sync, to_email, subject, plain_text, html)

# ============================================================
# ALERTAS
# ============================================================
_alert_cooldowns: Dict[str, float] = {}
_COOLDOWN_SECONDS = 3600

def _check_cooldown(artist_id: str) -> Optional[dict]:
    now_ts = time.time()
    last = _alert_cooldowns.get(str(artist_id))
    if last and now_ts - last < _COOLDOWN_SECONDS:
        return {"triggered": False, "reason": "cooldown", "cooldown_remaining": int(_COOLDOWN_SECONDS - (now_ts - last))}
    return None

def _check_thresholds(plays: int, likes: int, follows: int, thr_plays: int, thr_likes: int, thr_follows: int) -> list:
    triggers = []
    if follows >= thr_follows:
        triggers.append({"kind": "follows", "count": follows, "threshold": thr_follows})
    if plays >= thr_plays:
        triggers.append({"kind": "plays", "count": plays, "threshold": thr_plays})
    if likes >= thr_likes:
        triggers.append({"kind": "likes", "count": likes, "threshold": thr_likes})
    return triggers

async def _fetch_artist_email(client: httpx.AsyncClient, artist_id: str) -> Optional[str]:
    try:
        resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/api/artists/{artist_id}", timeout=5)
        if resp.status_code == 200:
            artist = resp.json()
            return artist.get("email") or artist.get("contactEmail") or artist.get("correo")
    except HTTPException:
        pass
    except Exception as e:
        logger.warning(f"Error fetching artist email: {e}")
    return None

async def notify_artist_alert(artist_id: str, window_minutes: int = 60, thresholds: Optional[Dict[str, int]] = None, notify_email: Optional[str] = None):
    window = int(window_minutes or 60)
    thresholds = thresholds or {}
    thr_follows = int(thresholds.get("follows", 10))
    thr_plays = int(thresholds.get("plays", 100))
    thr_likes = int(thresholds.get("likes", 50))

    cooldown_result = _check_cooldown(artist_id)
    if cooldown_result:
        return cooldown_result

    end = datetime.now(timezone.utc)
    start = end - timedelta(minutes=window)

    agg = await EventDAO.aggregate_for_artist(artist_id, start, end)
    plays = int(agg.get("plays", 0))
    likes = int(agg.get("likes", 0))
    follows = int(agg.get("follows", 0))

    triggers = _check_thresholds(plays, likes, follows, thr_plays, thr_likes, thr_follows)

    if not triggers:
        return {"triggered": False, "details": {"plays": plays, "likes": likes, "follows": follows}}

    recipient = notify_email
    if not recipient and CONTENT_SERVICE_URL:
        async with httpx.AsyncClient() as client:
            recipient = await _fetch_artist_email(client, artist_id)

    subject = f"Alerta de actividad para artist {artist_id}"
    plain = f"Se detectó actividad en los últimos {window} minutos: " + ", ".join([f"{t['kind']}={t['count']}" for t in triggers])
    html = "<p>Se detectó actividad en los últimos {} minutos:</p><ul>{}</ul>".format(
        window, "".join(f"<li>{t['kind']}: {t['count']} (umbral {t['threshold']})</li>" for t in triggers)
    )

    sent = False
    send_error = None
    if recipient:
        try:
            await send_email_async(recipient, subject, plain, html)
            sent = True
            _alert_cooldowns[str(artist_id)] = time.time()
        except Exception as e:
            send_error = str(e)

    return {
        "triggered": True,
        "details": {"plays": plays, "likes": likes, "follows": follows},
        "triggers": triggers,
        "email": {"recipient": recipient, "sent": sent, "error": send_error}
    }

@router.post("/stats/alerts")
async def create_alert(payload: Dict[str, Any]):
    artist_id = payload.get("artistId")
    if not artist_id:
        raise HTTPException(status_code=400, detail="artistId is required")
    window = int(payload.get("windowMinutes", 60))
    thresholds = payload.get("thresholds", {}) or {}
    notify_email = payload.get("notifyEmail")
    return await notify_artist_alert(artist_id, window, thresholds, notify_email)

# ============================================================
# CIRCUIT BREAKER + RETRY
# ============================================================
def _create_content_cb():
    try:
        return CircuitBreaker(fail_max=5, reset_timeout=30)
    except TypeError:
        try:
            return CircuitBreaker(fail_max=5, timeout_duration=30)
        except TypeError:
            return CircuitBreaker(fail_max=5)

content_cb = _create_content_cb()

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
    reraise=True
)
async def _http_get_with_retry(client: httpx.AsyncClient, url: str, **kwargs):
    response = await client.get(url, **kwargs)
    if response.status_code in (502, 503, 504):
        raise httpx.ConnectError(f"Server error {response.status_code}")
    return response

async def http_get_with_cb(client: httpx.AsyncClient, url: str, **kwargs):
    try:
        @content_cb
        async def _call():
            return await _http_get_with_retry(client, url, **kwargs)
        return await _call()
    except CircuitBreakerError:
        raise HTTPException(status_code=503, detail="Content service unavailable (circuit open)")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="Content service timeout after retries")
    except httpx.ConnectError:
        raise HTTPException(status_code=502, detail="Content service connection error after retries")

# ============================================================
# CACHE
# ============================================================
CACHE_MAX_SIZE = int(os.getenv("CACHE_MAX_SIZE", "500"))
CACHE_DEFAULT_TTL = int(os.getenv("CACHE_DEFAULT_TTL", "3600"))

_cache: TTLCache = TTLCache(maxsize=CACHE_MAX_SIZE, ttl=CACHE_DEFAULT_TTL)
_cache_locks: Dict[str, asyncio.Lock] = {}

async def _get_cached(key: str, fetcher: Callable[[], Coroutine[Any, Any, Any]]):
    try:
        cached = _cache.get(key)
        if cached is not None:
            return cached
    except KeyError:
        pass

    lock = _cache_locks.setdefault(key, asyncio.Lock())
    async with lock:
        try:
            cached = _cache.get(key)
            if cached is not None:
                return cached
        except KeyError:
            pass

        value = await fetcher()
        _cache[key] = value

        if len(_cache_locks) > CACHE_MAX_SIZE * 2:
            keys_to_remove = list(_cache_locks.keys())[:CACHE_MAX_SIZE]
            for k in keys_to_remove:
                _cache_locks.pop(k, None)

        return value

@router.post("/stats/cache/clear")
async def clear_cache(key: Optional[str] = None):
    if key:
        _cache.pop(key, None)
        _cache_locks.pop(key, None)
        return {"cleared": key}
    _cache.clear()
    _cache_locks.clear()
    return {"cleared": "all"}

@router.get("/stats/cache/info")
async def cache_info():
    return {
        "current_size": len(_cache),
        "max_size": _cache.maxsize,
        "ttl_seconds": _cache.ttl,
        "keys": list(_cache.keys())[:50]
    }

# ============================================================
# ENDPOINTS 
# ============================================================

@router.get("/stats/artist/{artist_id}/kpis")
async def get_artist_kpis(artist_id: str, start_date: Optional[str] = Query(None, alias="startDate"), end_date: Optional[str] = Query(None, alias="endDate")):
    try:
        start = datetime.fromisoformat(start_date) if start_date else None
        end = datetime.fromisoformat(end_date) if end_date else None
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format (ISO)")

    if start or end:
        agg = await EventDAO.aggregate_for_artist(artist_id, start, end)
        return _format_kpi_response(artist_id, agg)
    
    doc = await ArtistKPIDAO.get_by_artist(artist_id)
    if not doc:
        return {"artistId": artist_id, "plays": 0, "likes": 0, "follows": 0, "purchases": 0, "revenue": 0.0}
    return _format_kpi_response(artist_id, doc)

def _format_kpi_response(artist_id: str, data: dict) -> dict:
    return {
        "artistId": data.get("artistId", artist_id),
        "plays": int(data.get("plays", 0)),
        "likes": int(data.get("likes", 0)),
        "follows": int(data.get("follows", 0)),
        "purchases": int(data.get("purchases", 0)),
        "revenue": float(data.get("revenue", 0.0))
    }

@router.get("/stats/trending")
async def get_trending(genre: Optional[str] = None, period: str = "week", limit: int = 10):
    genre_param = (genre or "").strip().lower()
    key = f"trending:{genre_param}:{period}:{limit}"

    async def _compute():
        since = datetime.now(timezone.utc) - timedelta(days=_get_days_from_period(period))
        db = get_db()

        if genre_param == "tracks":
            return await _compute_trending_tracks(db, since, limit)
        elif genre_param == "artists":
            return await _compute_trending_artists(db, since, limit)
        return []

    return await _get_cached(key, _compute)

async def _compute_trending_tracks(db, since: datetime, limit: int) -> list:
    pipeline = _build_track_pipeline(since, limit)
    rows = await db["events"].aggregate(pipeline).to_list(length=limit)
    results = []
    async with httpx.AsyncClient() as client:
        for r in rows:
            track_data = await _fetch_track_data(client, r)
            if track_data:
                results.append(track_data)
    return results

async def _fetch_track_data(client: httpx.AsyncClient, row: dict) -> Optional[dict]:
    track_id = row.get("_id")
    album_id = row.get("albumId")
    if not album_id:
        return None
    try:
        resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/api/albums/{album_id}", timeout=5)
        if resp.status_code != 200:
            return None
        album = resp.json()
        tracks = album.get("tracks", [])
        track_obj = next((t for t in tracks if str(t.get("id")) == str(track_id) or str(t.get("_id")) == str(track_id)), None)
        if track_obj:
            return {
                "id": track_id,
                "albumId": album_id,
                "title": track_obj.get("title") or track_obj.get("name"),
                "coverImage": album.get("coverImage"),
                "artistName": album.get("artist") or album.get("artistName"),
                "url": track_obj.get("url"),
                "count": row.get("count", 0),
                "type": "track"
            }
    except HTTPException:
        raise
    except Exception:
        pass
    return None

async def _compute_trending_artists(db, since: datetime, limit: int) -> list:
    pipeline = _build_artist_pipeline(since, limit)
    rows = await db["events"].aggregate(pipeline).to_list(length=limit)
    results = []
    async with httpx.AsyncClient() as client:
        for r in rows:
            artist_data = await _fetch_artist_data(client, r)
            if artist_data:
                results.append(artist_data)
    return results

async def _fetch_artist_data(client: httpx.AsyncClient, row: dict) -> Optional[dict]:
    aid = row.get("_id")
    try:
        resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/api/artists/{aid}", timeout=5)
        if resp.status_code != 200:
            return None
        artist = resp.json()
        return {
            "entityId": aid,
            "id": aid,
            "name": artist.get("name") or artist.get("bandName"),
            "profileImage": artist.get("profileImage") or artist.get("image"),
            "count": row.get("count", 0),
            "type": "artist"
        }
    except HTTPException:
        raise
    except Exception:
        pass
    return None

@router.get("/recommendations/user/{user_id}")
async def recommend_for_user(user_id: str, limit: int = 20):
    key = f"userrec:{user_id}:{limit}"

    async def _compute():
        pipeline = _build_user_genre_pipeline(user_id)
        db = get_db()
        rows = await db["events"].aggregate(pipeline).to_list(length=5)
        genres = [r.get("_id") for r in rows if r.get("_id")]
        results = await _fetch_albums_by_genres(genres, limit)
        if not results:
            results = await _fallback_popular_artists(limit)
        return results[:limit]

    return await _get_cached(key, _compute)

async def _fetch_albums_by_genres(genres: list, limit: int) -> list:
    results = []
    async with httpx.AsyncClient() as client:
        for r in rows:
            eid = r.get("_id")
            count = r.get("count", 0)
            entry = {"id": eid, "count": count, "type": None, "title": None, "artist": None, "albumId": None, "albumTitle": None}

            if not eid:
                enriched.append(entry)
                continue

            # Caso pista con formato "albumId_trackId" o "albumId_trackIndex"
            if "_" in str(eid):
                try:
                    album_id, track_key = str(eid).split("_", 1)
                    resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/api/albums/{album_id}", timeout=5)
                    if resp.status_code == 200:
                        album = resp.json()
                        tracks = album.get("tracks", []) or []
                        # buscar por id o por índice
                        track_obj = next((t for t in tracks if str(t.get("id")) == str(track_key) or str(t.get("_id")) == str(track_key)), None)
                        if not track_obj and track_key.isdigit():
                            idx = int(track_key) - 1
                            if 0 <= idx < len(tracks):
                                track_obj = tracks[idx]
                        if track_obj:
                            entry.update({
                                "type": "track",
                                "title": track_obj.get("title") or track_obj.get("name"),
                                "artist": album.get("artist") or album.get("artistName"),
                                "albumId": album_id,
                                "albumTitle": album.get("title") or album.get("name")
                            })
                            enriched.append(entry)
                            continue
                except HTTPException:
                    raise
                except Exception:
                    pass

            # Intentar resolver como álbum
            try:
                resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/albums?genre={g}&limit={limit}", timeout=5)
                if resp.status_code == 200:
                    for it in resp.json()[:limit]:
                        results.append({"id": it.get("_id") or it.get("id"), "type": "album", "reason": f"genre:{g}", "score": 1.0})
            except HTTPException:
                raise
            except Exception:
                pass
    return results

async def _fallback_popular_artists(limit: int) -> list:
    top = await EventDAO.aggregate_by_entity("artist", since=None, limit=limit)
    return [{"id": t.get("_id"), "type": "artist", "reason": "popular", "score": t.get("count", 0)} for t in top]

@router.get("/recommendations/similar")
async def recommend_similar(
    genre: str = Query(..., description="Género a usar para recomendar"),
    exclude_id: Optional[str] = Query(None, alias="excludeId", description="ID de álbum a excluir"),
    limit: int = 10
):
    url = f"{CONTENT_SERVICE_URL}/api/albums"
    params = {"genre": genre}
    async with httpx.AsyncClient() as client:
        try:
            resp = await http_get_with_cb(client, url, params=params, timeout=10.0)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=502, detail="Content service error")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Content service error")

    items = resp.json() or []
    return _filter_similar_results(items, exclude_id, genre, limit)

def _filter_similar_results(items: list, exclude_id: Optional[str], genre: str, limit: int) -> list:
    results = []
    for item in items:
        item_id = item.get("id") or item.get("_id")
        if not item_id:
            continue
        if exclude_id and str(item_id) == str(exclude_id):
            continue
        results.append({
            "id": item_id,
            "type": "album",
            "title": item.get("title") or item.get("name"),
            "coverImage": item.get("coverImage"),
            "artist": item.get("artist"),
            "reason": f"genre:{genre}",
            "score": 1.0
        })
        if len(results) >= limit:
            break
    return results

@router.get("/stats/cb/status")
async def cb_status():
    def _attr(obj, *names):
        for n in names:
            if hasattr(obj, n):
                v = getattr(obj, n)
                return v.name if hasattr(v, "name") else v
        return None

    return {
        "state": str(_attr(content_cb, "state", "current_state", "_state")),
        "fail_count": _attr(content_cb, "fail_counter", "failure_count", "fail_count", "_fail_counter", "_fail_count"),
        "fail_max": _attr(content_cb, "fail_max", "_fail_max"),
        "reset_timeout": _attr(content_cb, "reset_timeout", "timeout_duration", "_reset_timeout"),
        "opened_at": str(getattr(content_cb, "_opened_at", None)) if getattr(content_cb, "_opened_at", None) else None
    }