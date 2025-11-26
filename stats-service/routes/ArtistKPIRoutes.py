from fastapi import APIRouter
from controller.EventController import router as event_router
from controller.ArtistKPIController import router as artist_kpi_router

router = APIRouter()
router.include_router(event_router)
router.include_router(artist_kpi_router)