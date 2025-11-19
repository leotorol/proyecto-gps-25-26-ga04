from typing import Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field

class EventModel(BaseModel):
    eventType: str = Field(..., example="track.played")
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    userId: Optional[str] = None
    anonymous: Optional[bool] = False
    entityType: Optional[str] = None
    entityId: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None