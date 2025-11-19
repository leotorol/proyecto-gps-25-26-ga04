from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal

class ArtistKPIModel(BaseModel):
    artistId: str
    period: Optional[str] = None
    plays: int = 0
    uniqueListeners: int = 0
    likes: int = 0
    follows: int = 0
    purchases: int = 0
    revenue: float = 0.0