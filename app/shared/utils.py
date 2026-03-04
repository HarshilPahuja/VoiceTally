from datetime import datetime


def current_timestamp() -> str:
    """
    Returns ISO formatted current timestamp
    """
    return datetime.utcnow().isoformat()


def safe_get(data: dict, key: str, default=None):
    """
    Safely get a key from dictionary
    """
    return data.get(key, default)
