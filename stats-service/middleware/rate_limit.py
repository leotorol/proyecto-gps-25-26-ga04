from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.requests import Request
import os

# Límites configurables por env
DEFAULT_LIMIT = os.getenv("RATE_LIMIT_DEFAULT")
STRICT_LIMIT = os.getenv("RATE_LIMIT_STRICT")

# Usar IP real del cliente
limiter = Limiter(key_func=get_remote_address, default_limits=[DEFAULT_LIMIT])

def get_limiter() -> Limiter:
    return limiter