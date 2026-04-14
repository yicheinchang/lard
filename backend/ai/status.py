import threading
import logging

logger = logging.getLogger(__name__)

# Global event to signal when heavy AI libraries and models are fully loaded
_ai_ready_event = threading.Event()

def set_ai_ready():
    """Signal that AI libraries are preloaded and ready for use."""
    _ai_ready_event.set()
    logger.info("AI Status: Ready signal set.")

def is_ai_ready() -> bool:
    """Check if the AI libraries are fully loaded."""
    return _ai_ready_event.is_set()

def wait_for_ai_ready(timeout: float | None = None) -> bool:
    """
    Wait for the AI libraries to be ready.
    Returns True if ready, False if timed out.
    """
    return _ai_ready_event.wait(timeout=timeout)
