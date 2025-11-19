from typing import Dict, Any, Optional
from ..models.artist_kpi import ArtistKPIModel

class ArtistKPIFactory:
    @staticmethod
    def create(artist_id: str, initial: Optional[Dict[str, Any]] = None) -> ArtistKPIModel:
        data = {
            "artistId": str(artist_id),
            "plays": 0,
            "uniqueListeners": 0,
            "likes": 0,
            "follows": 0,
            "purchases": 0,
            "revenue": 0.0
        }
        if initial:
            data.update(initial)
        return ArtistKPIModel(**data)