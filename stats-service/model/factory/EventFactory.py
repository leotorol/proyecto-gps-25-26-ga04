from datetime import datetime, timezone
from typing import Dict, Any
from model.models.EventModel import EventModel

class EventFactory:
    @staticmethod
    def create(payload: Dict[str, Any]) -> EventModel:
        if 'timestamp' in payload and isinstance(payload['timestamp'], str):
            try:
                payload['timestamp'] = datetime.fromisoformat(payload['timestamp'])
            except Exception:
                payload['timestamp'] = datetime.now(timezone.utc)
        return EventModel(**payload)