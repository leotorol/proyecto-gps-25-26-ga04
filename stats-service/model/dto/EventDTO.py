from pydantic import BaseModel
from typing import Optional, Dict, Any
from datetime import datetime

class EventDTO(BaseModel):
    eventType: str
    timestamp: datetime
    userId: Optional[str] = None
    anonymous: Optional[bool] = False
    entityType: Optional[str] = None
    entityId: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None