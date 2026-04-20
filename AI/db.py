"""
MongoDB helper for saving prediction history.
"""

from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
from typing import Any

from pymongo import MongoClient
from pymongo.collection import Collection


ENV_PATH = Path(__file__).with_name(".env")


def _load_env_file(path: Path = ENV_PATH) -> None:
    """Load simple KEY=VALUE pairs without adding a dependency."""
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_env_file()

MONGO_URI = os.getenv("MONGO_URI")
DATABASE_NAME = os.getenv("MONGO_DB", "stampede_window_predictor")
COLLECTION_NAME = os.getenv("MONGO_COLLECTION", "predictions")


def database_configured() -> bool:
    """Return True when a MongoDB URI is available from .env or environment."""
    return bool(MONGO_URI)


def get_predictions_collection() -> Collection | None:
    """Create the Mongo collection lazily so imports never fail."""
    if not MONGO_URI:
        return None

    client = MongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=1000,
        connectTimeoutMS=1000,
        socketTimeoutMS=1000,
    )
    return client[DATABASE_NAME][COLLECTION_NAME]


def save_prediction(input_data: dict[str, Any], output_data: dict[str, Any]) -> str | None:
    """Save prediction history without blocking the API if MongoDB is offline."""
    document = {
        "input": input_data,
        "output": output_data,
        "created_at": datetime.now(timezone.utc),
    }

    try:
        collection = get_predictions_collection()
        if collection is None:
            return None

        result = collection.insert_one(document)
        return str(result.inserted_id)
    except Exception:
        return None
