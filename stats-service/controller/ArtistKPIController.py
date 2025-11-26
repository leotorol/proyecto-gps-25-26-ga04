from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any, Callable, Coroutine
from datetime import datetime, timedelta
import io, csv, os
import httpx
import time
import asyncio
import smtplib

from email.message import EmailMessage
from aiobreaker import CircuitBreaker, CircuitBreakerError
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
from cachetools import TTLCache
from config.db import get_db
from model.dao.EventDAO import EventDAO
from model.dao.ArtistKPIDAO import ArtistKPIDAO

router = APIRouter()

CONTENT_SERVICE_URL = os.getenv("CONTENT_SERVICE_URL")
_SMTP_HOST = os.getenv("SMTP_HOST")
_SMTP_PORT = int(os.getenv("SMTP_PORT"))
_SMTP_USER = os.getenv("SMTP_USER")
_SMTP_PASS = os.getenv("SMTP_PASS")
_FROM_EMAIL = os.getenv("FROM_EMAIL")
# GA04-32-H14.1.1-Montar-servidor-SMPT-para-enviar-alertas Tarea legada
# GA04-32-H14.1.2-Montar-servidor-SMPT-para-enviar-alertas Tarea legada
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

# in-memory cooldowns to avoid spamming
_alert_cooldowns: Dict[str, float] = {}  # artistId -> last_sent_ts
_COOLDOWN_SECONDS = 3600  # 1 hour

async def notify_artist_alert(artist_id: str, window_minutes: int = 60, thresholds: Optional[Dict[str, int]] = None, notify_email: Optional[str] = None):
    """
    Returns dict with same shape as the endpoint response.
    """
    window = int(window_minutes or 60)
    thresholds = thresholds or {}
    thr_follows = int(thresholds.get("follows", 10))
    thr_plays = int(thresholds.get("plays", 100))
    thr_likes = int(thresholds.get("likes", 50))

    # cooldown check
    now_ts = time.time()
    last = _alert_cooldowns.get(str(artist_id))
    if last and now_ts - last < _COOLDOWN_SECONDS:
        return {"triggered": False, "reason": "cooldown", "cooldown_remaining": int(_COOLDOWN_SECONDS - (now_ts - last))}

    end = datetime.utcnow()
    start = end - timedelta(minutes=window)

    agg = await EventDAO.aggregate_for_artist(artist_id, start, end)
    plays = int(agg.get("plays", 0))
    likes = int(agg.get("likes", 0))
    follows = int(agg.get("follows", 0))

    triggers = []
    if follows >= thr_follows:
        triggers.append({"kind": "follows", "count": follows, "threshold": thr_follows})
    if plays >= thr_plays:
        triggers.append({"kind": "plays", "count": plays, "threshold": thr_plays})
    if likes >= thr_likes:
        triggers.append({"kind": "likes", "count": likes, "threshold": thr_likes})

    if not triggers:
        return {"triggered": False, "details": {"plays": plays, "likes": likes, "follows": follows}}

    # resolve recipient
    recipient = notify_email
    if not recipient and CONTENT_SERVICE_URL:
        try:
            async with httpx.AsyncClient() as client:
                resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/api/artists/{artist_id}", timeout=5)
                if resp.status_code == 200:
                    artist = resp.json()
                    recipient = artist.get("email") or artist.get("contactEmail") or artist.get("correo") or None
        except HTTPException:
            pass
        except Exception:
            pass

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
            _alert_cooldowns[str(artist_id)] = now_ts
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
    """
    Wrapper endpoint for testing/manual trigger.
    Accepts same payload as before:
    {
      "artistId": "abc123",
      "windowMinutes": 60,
      "thresholds": {"follows": 10, "plays": 100, "likes": 50},
      "notifyEmail": "me@example.com"   # optional
    }
    """
    artist_id = payload.get("artistId")
    if not artist_id:
        raise HTTPException(status_code=400, detail="artistId is required")
    window = int(payload.get("windowMinutes", 60))
    thresholds = payload.get("thresholds", {}) or {}
    notify_email = payload.get("notifyEmail")
    return await notify_artist_alert(artist_id, window, thresholds, notify_email)

# Circuit breaker for external content service (in-process, params adjustable)
def _create_content_cb():
    try:
        return CircuitBreaker(fail_max=5, reset_timeout=30)
    except TypeError:
        try:
            return CircuitBreaker(fail_max=5, timeout_duration=30)
        except TypeError:
            return CircuitBreaker(fail_max=5)

content_cb = _create_content_cb()

# Retry config: 3 intentos, backoff exponencial (1s, 2s, 4s), solo en errores transitorios
@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    retry=retry_if_exception_type((httpx.TimeoutException, httpx.ConnectError)),
    reraise=True
)
async def _http_get_with_retry(client: httpx.AsyncClient, url: str, **kwargs):
    """HTTP GET con retry automático en errores transitorios."""
    response = await client.get(url, **kwargs)
    # Retry también en 502, 503, 504 (errores de servidor transitorios)
    if response.status_code in (502, 503, 504):
        raise httpx.ConnectError(f"Server error {response.status_code}")
    return response

async def http_get_with_cb(client: httpx.AsyncClient, url: str, **kwargs):
    """
    HTTP GET con:
    1. Retry automático (3 intentos, backoff exponencial)
    2. Circuit breaker (protege contra fallos continuos)
    """
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
    except Exception:
        raise

# ============================================================
# CACHE CON LÍMITE LRU + TTL
# ============================================================
# Tarea GA04-24-H11.1.1-Implementación-de-cache-y-TTL legada 
# Tarea GA04-24-H11.1.2-Implementación-de-cache-y-TTL parte 2 legada
# Configuración vía env vars 
CACHE_MAX_SIZE = int(os.getenv("CACHE_MAX_SIZE", "500"))      # máximo 500 entradas
CACHE_DEFAULT_TTL = int(os.getenv("CACHE_DEFAULT_TTL", "3600"))  # 1 hora por defecto

# TTLCache: cuando se llena, descarta la entrada menos usada (LRU)
# El TTL se gestiona por entrada en _get_cached
_cache: TTLCache = TTLCache(maxsize=CACHE_MAX_SIZE, ttl=CACHE_DEFAULT_TTL)
_cache_locks: Dict[str, asyncio.Lock] = {}

async def _get_cached(key: str, ttl: int, fetcher: Callable[[], Coroutine[Any, Any, Any]]):
    """
    Obtiene valor de cache o lo calcula.
    - key: clave única
    - ttl: tiempo de vida en segundos (se usa el TTL del cache global)
    - fetcher: función async que calcula el valor si no está en cache
    """
    # Intentar obtener del cache (TTLCache maneja expiración automáticamente)
    try:
        cached = _cache.get(key)
        if cached is not None:
            return cached
    except KeyError:
        pass

    # Lock por key para evitar thundering herd
    lock = _cache_locks.setdefault(key, asyncio.Lock())
    async with lock:
        # Double-check después de adquirir lock
        try:
            cached = _cache.get(key)
            if cached is not None:
                return cached
        except KeyError:
            pass

        # Calcular y guardar
        value = await fetcher()
        _cache[key] = value
        
        # Limpiar locks antiguos si hay demasiados (evitar memory leak)
        if len(_cache_locks) > CACHE_MAX_SIZE * 2:
            keys_to_remove = list(_cache_locks.keys())[:CACHE_MAX_SIZE]
            for k in keys_to_remove:
                _cache_locks.pop(k, None)
        
        return value

@router.post("/stats/cache/clear")
async def clear_cache(key: Optional[str] = None):
    """Limpia cache completo o una key específica."""
    if key:
        try:
            del _cache[key]
        except KeyError:
            pass
        _cache_locks.pop(key, None)
        return {"cleared": key}
    _cache.clear()
    _cache_locks.clear()
    return {"cleared": "all"}

@router.get("/stats/cache/info")
async def cache_info():
    """Endpoint para monitorear estado del cache."""
    return {
        "current_size": len(_cache),
        "max_size": _cache.maxsize,
        "ttl_seconds": _cache.ttl,
        "keys": list(_cache.keys())[:50]  # máximo 50 para no saturar respuesta
    }
# GA04-26-H11.2-API-para-consultar-KPIs Tarea legada 
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
    # cache key and TTL (1 hour)
    key = f"top:{type}:{period}:{limit}"
    ttl = 3600

    async def _compute():
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
                        resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/artists/{eid}", timeout=5)
                        if resp.status_code == 200:
                            title = resp.json().get("name") or resp.json().get("titulo") or None
                    elif type == "album":
                        resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/albums/{eid}", timeout=5)
                        if resp.status_code == 200:
                            title = resp.json().get("title") or resp.json().get("name")
                except HTTPException:
                    # circuit open -> propagate as service unavailable
                    raise
                except Exception:
                    pass
                results.append({"id": eid, "type": type, "title": title, "metricValue": r.get("count", 0)})
        return results

    return await _get_cached(key, ttl, _compute)

# GET /stats/trending
@router.get("/stats/trending")
async def get_trending(genre: Optional[str] = None, period: str = "week", limit: int = 10):
    # Use a short TTL for freshness (5 minutes)
    genre_param = (genre or "").strip().lower()
    key = f"trending:{genre_param}:{period}:{limit}"
    ttl = 300

    async def _compute():
        days_map = {"day":1, "week":7, "month":30}
        since = datetime.utcnow() - timedelta(days=days_map.get(period,7))
        db = get_db()

        async with httpx.AsyncClient() as client:
            # TRACKS: Basado en reproducciones (track.played)
            if genre_param == "tracks":
                pipeline = [
                    {"$match": {"timestamp": {"$gte": since}, "eventType": "track.played"}},
                    {"$group": {"_id": "$entityId", "count": {"$sum": 1}, "albumId": {"$first": "$metadata.albumId"}}},
                    {"$sort": {"count": -1}},
                    {"$limit": limit}
                ]
                rows = await db["events"].aggregate(pipeline).to_list(length=limit)
                results = []
                for r in rows:
                    track_id = r.get("_id")
                    album_id = r.get("albumId")
                    if not album_id:
                        continue
                    try:
                        # Obtenemos datos del álbum (protegido por circuit breaker)
                        resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/api/albums/{album_id}", timeout=5)
                        if resp.status_code != 200:
                            continue
                        album = resp.json()
                        tracks = album.get("tracks", [])
                        track_obj = next((t for t in tracks if str(t.get("id")) == str(track_id) or str(t.get("_id")) == str(track_id)), None)
                        
                        if track_obj:
                            results.append({
                                "id": track_id,
                                "albumId": album_id,
                                "title": track_obj.get("title") or track_obj.get("name"),
                                "coverImage": album.get("coverImage"),
                                "artistName": album.get("artist") or album.get("artistName"),
                                "url": track_obj.get("url"),
                                "count": r.get("count", 0),
                                "type": "track"
                            })
                    except HTTPException:
                        raise
                    except Exception:
                        continue
                return results

            # ARTISTS: Basado en nuevos seguidores (artist.followed)
            elif genre_param == "artists":
                pipeline = [
                    {"$match": {"timestamp": {"$gte": since}, "eventType": "artist.followed"}},
                    {"$group": {"_id": "$entityId", "count": {"$sum": 1}}},
                    {"$sort": {"count": -1}},
                    {"$limit": limit}
                ]
                rows = await db["events"].aggregate(pipeline).to_list(length=limit)
                results = []
                for r in rows:
                    aid = r.get("_id")
                    try:
                        resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/api/artists/{aid}", timeout=5)
                        if resp.status_code != 200:
                            continue
                        artist = resp.json()
                        results.append({
                            "entityId": aid,
                            "id": aid,
                            "name": artist.get("name") or artist.get("bandName"),
                            "profileImage": artist.get("profileImage") or artist.get("image"),
                            "count": r.get("count", 0),
                            "type": "artist"
                        })
                    except HTTPException:
                        raise
                    except Exception:
                        continue
                return results
            
            return []

    return await _get_cached(key, ttl, _compute)

# tarea GA04-27-H12.1 Exportar métricas por rango legada
# GET /stats/export
@router.get("/stats/export")
async def export_metrics(type: str = "plays", startDate: Optional[str] = None, endDate: Optional[str] = None, format: str = "csv"):
    # mapear tipo a eventType cuando aplique
    type_map = {
        "plays": "track.played",
        "likes": "track.liked",
        "follows": "artist.followed",
        "purchases": "order.paid"
    }
    event_filter = type_map.get(type)

    match = {}
    try:
        if startDate:
            match.setdefault("timestamp", {})["$gte"] = datetime.fromisoformat(startDate)
        if endDate:
            match.setdefault("timestamp", {})["$lte"] = datetime.fromisoformat(endDate)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid date format")

    if event_filter:
        match["eventType"] = event_filter

    pipeline = []
    if match:
        pipeline.append({"$match": match})
    pipeline.append({"$group": {"_id": "$entityId", "count": {"$sum": 1}}})
    pipeline.append({"$sort": {"count": -1}})

    db = get_db()
    rows = await db["events"].aggregate(pipeline).to_list(length=10000)

    # Enriquecer filas consultando content-service
    enriched = []
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
                resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/api/albums/{eid}", timeout=5)
                if resp.status_code == 200:
                    album = resp.json()
                    entry.update({
                        "type": "album",
                        "title": album.get("title") or album.get("name"),
                        "artist": album.get("artist") or album.get("artistName"),
                        "albumId": album.get("id") or album.get("_id"),
                        "albumTitle": album.get("title") or album.get("name")
                    })
                    enriched.append(entry)
                    continue
            except HTTPException:
                raise
            except Exception:
                pass

            # Intentar resolver como artista
            try:
                resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/api/artists/{eid}", timeout=5)
                if resp.status_code == 200:
                    artist = resp.json()
                    entry.update({
                        "type": "artist",
                        "title": artist.get("name") or artist.get("bandName"),
                        "artist": artist.get("name") or artist.get("bandName")
                    })
                    enriched.append(entry)
                    continue
            except HTTPException:
                raise
            except Exception:
                pass

            # Fallback: mantener datos crudos
            entry["type"] = "unknown"
            enriched.append(entry)

    if format == "json":
        return enriched

    # Construir CSV
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["id", "type", "title", "artist", "albumId", "albumTitle", "count"])
    for e in enriched:
        writer.writerow([
            e.get("id"),
            e.get("type"),
            e.get("title") or "",
            e.get("artist") or "",
            e.get("albumId") or "",
            e.get("albumTitle") or "",
            e.get("count", 0)
        ])
    return buf.getvalue()

# GET /stats/recommendations/user/{userId}
@router.get("/recommendations/user/{userId}")
async def recommend_for_user(userId: str, limit: int = 20):
    # cache user recommendations for 10 minutes
    key = f"userrec:{userId}:{limit}"
    ttl = 600

    async def _compute():
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
                    # Intentamos filtrar por género, si falla, no pasa nada
                    resp = await http_get_with_cb(client, f"{CONTENT_SERVICE_URL}/albums?genre={g}&limit={limit}", timeout=5)
                    if resp.status_code == 200:
                        for it in resp.json()[:limit]:
                            results.append({"id": it.get("_id") or it.get("id"), "type": "album", "reason": f"genre:{g}", "score": 1.0})
                except HTTPException:
                    raise
                except Exception:
                    pass
        if not results:
            top = await EventDAO.aggregate_by_entity("artist", since=None, limit=limit)
            for t in top:
                results.append({"id": t.get("_id"), "type": "artist", "reason": "popular", "score": t.get("count",0)})
        return results[:limit]

    return await _get_cached(key, ttl, _compute)

# GET /stats/recommendations/similar
@router.get("/recommendations/similar")
async def recommend_similar(
    genre: str = Query(..., description="Género a usar para recomendar"),
    excludeId: Optional[str] = Query(None, description="ID de álbum a excluir"),
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
    results = []
    for item in items:
        item_id = item.get("id") or item.get("_id")
        if not item_id:
            continue
        if excludeId and str(item_id) == str(excludeId):
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

# GET /stats/cb/status
@router.get("/stats/cb/status")
async def cb_status():
    # Estado legible del circuit breaker del content service
    def _attr(obj, *names):
        for n in names:
            if hasattr(obj, n):
                v = getattr(obj, n)
                try:
                    return v.name if hasattr(v, "name") else v
                except Exception:
                    return str(v)
        return None

    state = _attr(content_cb, "state", "current_state", "_state")
    fail_count = _attr(content_cb, "fail_counter", "failure_count", "fail_count", "_fail_counter", "_fail_count")
    fail_max = _attr(content_cb, "fail_max", "_fail_max")
    reset_timeout = _attr(content_cb, "reset_timeout", "timeout_duration", "_reset_timeout")
    opened_at = getattr(content_cb, "_opened_at", None)

    return {
        "state": str(state),
        "fail_count": fail_count,
        "fail_max": fail_max,
        "reset_timeout": reset_timeout,
        "opened_at": str(opened_at) if opened_at else None
    }