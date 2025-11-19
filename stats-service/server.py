from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.openapi.docs import get_swagger_ui_html
from pathlib import Path
from dotenv import load_dotenv
import os, json, subprocess, sys, inspect, asyncio, threading, yaml, uvicorn, signal 

# routers
from routes.EventRoutes import router as event_router
from routes.ArtistKPIRoutes import router as artist_kpi_router

# DB module
import config.db as db_module

CONNECT_FN = getattr(db_module, "connect_to_mongo", None)
CLOSE_FN = getattr(db_module, "close_mongo", None)

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(str(BASE_DIR / ".env"))
CONFIG_DIR = BASE_DIR / "config"
SHARED_META = CONFIG_DIR / "dbmeta.json"
LOCAL_META = CONFIG_DIR / "dbmeta_local.json"
IMPORT_SCRIPT = BASE_DIR / "import-db.js"
EXPORT_SCRIPT = BASE_DIR / "export-db.js"

app = FastAPI(title="UnderSounds — Stats Service", docs_url=None, redoc_url=None, openapi_url=None)

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

def run_node_script(script_path: Path) -> subprocess.CompletedProcess:
    if not script_path.exists():
        raise FileNotFoundError(f"{script_path} not found")
    return subprocess.run(["node", str(script_path)], cwd=str(BASE_DIR), capture_output=True, text=True)

def prompt_and_export():
    try:
        answer = input("\n¿Desea respaldar los datos con mongoexport? (S/N): ").strip().upper()
    except EOFError:
        answer = "N"
    if answer == "S":
        print("Ejecutando export-db.js ...")
        try:
            proc = run_node_script(EXPORT_SCRIPT)
            if proc.returncode != 0:
                print("export-db.js falló:", proc.stderr)
            else:
                print("Exportación completada:", proc.stdout)
                # bump version in shared & local meta
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
    try:
        await _call_maybe_async(CLOSE_FN)
        print("DB connection closed")
    except Exception as e:
        print("Error closing DB:", e)

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "stats-service"}

    
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
    # leer variables con valores por defecto
    port = int(os.getenv("PORT"))
    host = os.getenv("HOST")
    
        # registrar handler SIGINT para mostrar prompt interactivo
    def _sigint_handler(signum, frame):
        try:
            prompt_and_export()
        except Exception:
            sys.exit(0)

    signal.signal(signal.SIGINT, _sigint_handler)

    try:
        # ejecutar uvicorn; capturar Ctrl+C aquí y lanzar prompt interactivo una sola vez
        uvicorn.run("server:app", host=host, port=port, reload=False)
    except KeyboardInterrupt:
        # solo se ejecuta en el proceso que lanzó python server.py
        prompt_and_export()