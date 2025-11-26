from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.openapi.docs import get_swagger_ui_html
from pathlib import Path
from dotenv import load_dotenv
import os, json, subprocess, sys, inspect, asyncio, threading, yaml, uvicorn, signal 
from datetime import datetime
import psutil

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(str(BASE_DIR / ".env"))

# routers
from routes.EventRoutes import router as event_router
from routes.ArtistKPIRoutes import router as artist_kpi_router

# Rate limiting
from middleware.rate_limit import limiter, get_limiter
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

# DB module
import config.db as db_module

CONNECT_FN = getattr(db_module, "connect_to_mongo", None)
CLOSE_FN = getattr(db_module, "close_mongo", None)


CONFIG_DIR = BASE_DIR / "config"
SHARED_META = CONFIG_DIR / "dbmeta.json"
LOCAL_META = CONFIG_DIR / "dbmeta_local.json"
IMPORT_SCRIPT = BASE_DIR / "import-db.js"
EXPORT_SCRIPT = BASE_DIR / "export-db.js"

app = FastAPI(title="UnderSounds — Stats Service", docs_url=None, redoc_url=None, openapi_url=None)

# Attach limiter to app state and add exception handler
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Cargar especificación OpenAPI desde docs/Estadisticas.yaml y usarla como esquema OpenAPI
OPENAPI_YAML = BASE_DIR / "docs" / "Estadisticas.yaml"
if OPENAPI_YAML.exists():
    try:
        with OPENAPI_YAML.open(encoding="utf-8") as f:
            openapi_schema = yaml.safe_load(f)
        def _custom_openapi():
            return openapi_schema
        app.openapi = _custom_openapi
        print(f"OpenAPI cargada desde {OPENAPI_YAML}")
    except Exception as e:
        print("Error cargando OpenAPI YAML:", e)

# CORS
raw_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000")
origins = [o.strip() for o in raw_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# mount static view if present
view_dir = BASE_DIR / "view"
if view_dir.exists():
    app.mount("/view", StaticFiles(directory=str(view_dir)), name="view")

# include routers under /api
app.include_router(event_router, prefix="/api")
app.include_router(artist_kpi_router, prefix="/api")

def read_db_version(path: Path) -> int:
    try:
        if not path.exists():
            return 0
        data = json.loads(path.read_text(encoding="utf-8"))
        return int(data.get("dbVersion", 0))
    except Exception:
        return 0

def update_version_file(path: Path, new_version: int, collections=None):
    try:
        meta = {}
        if path.exists():
            meta = json.loads(path.read_text(encoding="utf-8"))
        meta["dbVersion"] = int(new_version)
        if collections is not None:
            meta["colecciones"] = collections
        path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        print(f"{path} actualizado a la versión {new_version}")
    except Exception as e:
        print("Error actualizando meta:", e)

def run_node_script(script_path: Path, interactive: bool = False) -> subprocess.CompletedProcess:
    if not script_path.exists():
        raise FileNotFoundError(f"{script_path} not found")
    
    if interactive:
        # Conectar directamente a la terminal para permitir interacción (preguntas/respuestas)
        return subprocess.run(
            ["node", str(script_path)], 
            cwd=str(BASE_DIR), 
            stdin=sys.stdin, 
            stdout=sys.stdout, 
            stderr=sys.stderr
        )
    else:
        # Capturar salida para procesos en segundo plano (logs)
        return subprocess.run(
            ["node", str(script_path)], 
            cwd=str(BASE_DIR), 
            capture_output=True, 
            text=True
        )

def prompt_and_export():
    try:
        # Usamos input directo de Python
        answer = input("\n¿Desea respaldar los datos con mongoexport? (S/N): ").strip().upper()
    except EOFError:
        answer = "N"
        
    if answer == "S":
        print("Iniciando export-db.js (Interactivo)...")
        try:
            # Llamada interactiva: el control pasa al script de Node
            proc = run_node_script(EXPORT_SCRIPT, interactive=True)
            
            if proc.returncode != 0:
                print("export-db.js terminó con errores.")
            else:
                print("Exportación finalizada correctamente.")
                
                # Actualizar metadatos (versión) después del éxito
                shared_meta = {}
                try:
                    if SHARED_META.exists():
                        shared_meta = json.loads(SHARED_META.read_text(encoding="utf-8"))
                except Exception:
                    shared_meta = {}
                
                current_collections = shared_meta.get("colecciones", [])
                new_version = int(shared_meta.get("dbVersion", 0)) + 1
                update_version_file(SHARED_META, new_version, current_collections)
                update_version_file(LOCAL_META, new_version, current_collections)
                
        except Exception as e:
            print("Error ejecutando export script:", e)
    else:
        print("No se realizará el respaldo de datos.")
    
    print("Saliendo.")
    sys.exit(0)

async def _call_maybe_async(fn, *args, **kwargs):
    if fn is None:
        return
    if inspect.iscoroutinefunction(fn):
        await fn(*args, **kwargs)
    else:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: fn(*args, **kwargs))

@app.on_event("startup")
async def startup_event():
    try:
        await _call_maybe_async(CONNECT_FN)
        print("DB connection initialized")
    except Exception as e:
        print("Error connecting DB on startup:", e)

    # run import-db.js if local meta version outdated
    shared_v = read_db_version(SHARED_META)
    local_v = read_db_version(LOCAL_META)
    if local_v < shared_v:
        try:
            print("Local DB version outdated, running import-db.js ...")
            result = run_node_script(IMPORT_SCRIPT)
            if result.returncode != 0:
                print("import-db.js failed:", result.stderr)
            else:
                print("import-db.js completed:", result.stdout)
                LOCAL_META.write_text(SHARED_META.read_text(encoding="utf-8"), encoding="utf-8")
        except Exception as e:
            print("Error running import script:", e)

@app.on_event("shutdown")
async def shutdown_event():
    """Graceful shutdown: cerrar recursos limpiamente."""
    print("Iniciando graceful shutdown...")
    
    # 1. Cerrar conexión a BD
    try:
        await _call_maybe_async(CLOSE_FN)
        print("DB connection closed")
    except Exception as e:
        print(f"Error closing DB: {e}")
    
    # 2. Limpiar cache
    try:
        from controller.ArtistKPIController import _cache, _cache_locks
        _cache.clear()
        _cache_locks.clear()
        print("Cache cleared")
    except Exception as e:
        print(f"Error clearing cache: {e}")
    
    print("Graceful shutdown completado.")


@app.get("/healthz")
async def healthz():
    """
    Health check completo:
    - db: estado de conexión a MongoDB
    - memory: uso de memoria del proceso
    - circuit_breaker: estado del CB hacia content-service
    """
    from controller.ArtistKPIController import content_cb
    
    health = {
        "status": "ok",
        "service": "stats-service",
        "timestamp": datetime.utcnow().isoformat(),
        "checks": {}
    }
    
    # 1. Check MongoDB
    try:
        from config.db import get_db
        db = get_db()
        if db is not None:
            # ping rápido
            await db.command("ping")
            health["checks"]["mongodb"] = {"status": "ok"}
        else:
            health["checks"]["mongodb"] = {"status": "error", "detail": "db is None"}
            health["status"] = "degraded"
    except Exception as e:
        health["checks"]["mongodb"] = {"status": "error", "detail": str(e)}
        health["status"] = "degraded"
    
    # 2. Check memoria
    try:
        process = psutil.Process()
        mem_info = process.memory_info()
        mem_mb = mem_info.rss / (1024 * 1024)
        health["checks"]["memory"] = {
            "status": "ok" if mem_mb < 500 else "warning",
            "rss_mb": round(mem_mb, 2)
        }
        if mem_mb >= 500:
            health["status"] = "degraded"
    except Exception as e:
        health["checks"]["memory"] = {"status": "unknown", "detail": str(e)}
    
    # 3. Check circuit breaker
    try:
        cb_state = getattr(content_cb, "state", None) or getattr(content_cb, "current_state", None)
        state_name = cb_state.name if hasattr(cb_state, "name") else str(cb_state)
        health["checks"]["circuit_breaker"] = {
            "status": "ok" if state_name.lower() == "closed" else "warning",
            "state": state_name
        }
        if state_name.lower() == "open":
            health["status"] = "degraded"
    except Exception as e:
        health["checks"]["circuit_breaker"] = {"status": "unknown", "detail": str(e)}
    
    return health

    
@app.get("/api/openapi.yaml", include_in_schema=False)
async def openapi_yaml():
    if OPENAPI_YAML.exists():
        return FileResponse(str(OPENAPI_YAML))
    return {"detail": "OpenAPI YAML not found"}, 404

# Serve Swagger UI pointing to the YAML above
@app.get("/api/docs", include_in_schema=False)
async def swagger_ui():
    return get_swagger_ui_html(openapi_url="/api/openapi.yaml", title="UnderSounds — Estadísticas — Swagger UI")

# Redirect legacy /api-docs (dash) to /api/docs
@app.get("/api-docs", include_in_schema=False)
async def redirect_api_docs():
    return RedirectResponse("/api/docs")

# Provide OpenAPI JSON at /api/openapi.json by converting the YAML
@app.get("/api/openapi.json", include_in_schema=False)
async def openapi_json():
    if OPENAPI_YAML.exists():
        with OPENAPI_YAML.open(encoding="utf-8") as f:
            schema = yaml.safe_load(f)
        return schema
    return {"detail": "OpenAPI YAML not found"}, 404

@app.get("/")
async def root():
    # si existe vista estática, redirigir allí; si no, a la documentación OpenAPI
    if view_dir.exists():
        return RedirectResponse("/view/index.html")
    return RedirectResponse("/api/docs")

if __name__ == "__main__":
    port = int(os.getenv("PORT"))
    host = os.getenv("HOST")
    
    # Graceful shutdown timeout (segundos para esperar requests activas)
    SHUTDOWN_TIMEOUT = int(os.getenv("SHUTDOWN_TIMEOUT", "30"))
    
    def _sigint_handler(signum, frame):
        try:
            prompt_and_export()
        except Exception:
            sys.exit(0)

    signal.signal(signal.SIGINT, _sigint_handler)

    try:
        # timeout_graceful_shutdown: espera N segundos antes de forzar cierre
        uvicorn.run(
            "server:app",
            host=host,
            port=port,
            reload=False,
            timeout_graceful_shutdown=SHUTDOWN_TIMEOUT
        )
    except KeyboardInterrupt:
        prompt_and_export()