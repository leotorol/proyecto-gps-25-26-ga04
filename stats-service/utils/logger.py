import structlog
import logging
import sys
import os

def setup_logging():
    """Configura structlog para logging estructurado."""
    
    is_dev = os.getenv("ENV", "development") != "production"
    log_level = os.getenv("LOG_LEVEL", "INFO").upper()
    
    # Procesadores comunes
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.stdlib.ExtraAdder(),
    ]
    
    if is_dev:
        # En desarrollo: output legible y colorizado
        structlog.configure(
            processors=shared_processors + [
                structlog.dev.ConsoleRenderer(colors=True)
            ],
            wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, log_level)),
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )
    else:
        # En producción: JSON puro
        structlog.configure(
            processors=shared_processors + [
                structlog.processors.dict_traps,
                structlog.processors.JSONRenderer()
            ],
            wrapper_class=structlog.make_filtering_bound_logger(getattr(logging, log_level)),
            context_class=dict,
            logger_factory=structlog.PrintLoggerFactory(),
            cache_logger_on_first_use=True,
        )

def get_logger(name: str = None):
    """Obtiene un logger con contexto opcional."""
    return structlog.get_logger(name or "stats-service")

# Configurar al importar
setup_logging()