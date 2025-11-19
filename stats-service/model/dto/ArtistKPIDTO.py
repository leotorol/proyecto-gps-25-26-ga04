from pydantic import BaseModel
from typing import Optional

class ArtistKPIDTO(BaseModel):
    artistId: str
    period: Optional[str] = None
    plays: int = 0
    uniqueListeners: int = 0
    likes: int = 0
    follows: int = 0
    purchases: int = 0
    revenue: float = 0.0