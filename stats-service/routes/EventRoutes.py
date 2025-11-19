from fastapi import APIRouter
from controller.EventController import router as event_router

router = APIRouter()
router.include_router(event_router)