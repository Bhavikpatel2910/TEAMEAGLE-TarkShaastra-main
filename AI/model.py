"""
PSI and ML logic for the Stampede Window Predictor.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any
import warnings

import pandas as pd
from joblib import load

try:
    from sklearn.exceptions import InconsistentVersionWarning
except Exception:  # pragma: no cover
    InconsistentVersionWarning = Warning


MODEL_PATH = Path(__file__).with_name("model.pkl")

REQUIRED_FIELDS = [
    "entryRate",
    "exitRate",
    "density",
    "width",
    "vehicleCount",
    "transportArrivalBurst",
    "weather",
    "festivalPeak",
]

RISK_ORDER = {
    "Low": 0,
    "Moderate": 1,
    "High": 2,
    "Critical": 3,
}


def _load_model() -> Any | None:
    """Load model.pkl once. If loading fails, PSI logic still works."""
    if not MODEL_PATH.exists():
        return None

    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", InconsistentVersionWarning)
            artifact = load(MODEL_PATH)
    except Exception:
        return None

    if isinstance(artifact, dict):
        return artifact.get("model")
    return artifact


MODEL = _load_model()


def encode_weather(weather: str) -> int:
    """Convert weather text to the numeric weather penalty used by PSI."""
    value = str(weather).strip().lower()
    if value == "clear":
        return 0
    if value == "heat":
        return 4
    if value == "rain":
        return 6
    raise ValueError("weather must be one of: Clear, Heat, Rain")


def _clean_data(data: dict[str, Any]) -> dict[str, float | str]:
    """Validate required input and convert numeric fields."""
    missing = [field for field in REQUIRED_FIELDS if field not in data]
    if missing:
        raise ValueError(f"Missing required field(s): {', '.join(missing)}")

    cleaned: dict[str, float | str] = {
        "weather": str(data["weather"]).strip().title(),
    }

    numeric_fields = [field for field in REQUIRED_FIELDS if field != "weather"]
    for field in numeric_fields:
        value = float(data[field])
        if value < 0:
            raise ValueError(f"{field} cannot be negative")
        cleaned[field] = value

    encode_weather(str(cleaned["weather"]))
    return cleaned


def calculate_psi(data: dict[str, Any]) -> float:
    """
    Calculate Pressure Safety Index using the additive PSI equation.
    """
    cleaned = _clean_data(data)

    entry_flow = float(cleaned["entryRate"])
    exit_flow = float(cleaned["exitRate"])
    density = float(cleaned["density"])
    width = float(cleaned["width"])
    vehicle_count = float(cleaned["vehicleCount"])
    arrival_burst = float(cleaned["transportArrivalBurst"])
    festival_peak = float(cleaned["festivalPeak"])
    weather_penalty = encode_weather(str(cleaned["weather"]))

    net_inflow = max(0.0, entry_flow - exit_flow)
    effective_width = max(width, 0.5)

    psi = (
        (8.7 * density)
        + (0.42 * (net_inflow / effective_width))
        + (1.9 * vehicle_count)
        + (10 * arrival_burst)
        + (7 * festival_peak)
        + weather_penalty
    )

    return round(max(0.0, psi), 2)


def get_risk_level(psi: float) -> str:
    """Classify PSI into Low, Moderate, High, or Critical."""
    if psi < 50:
        return "Low"
    if psi < 120:
        return "Moderate"
    if psi < 200:
        return "High"
    return "Critical"


def get_crush_window(psi: float) -> float:
    """Estimate minutes until crush window and clamp between 1 and 19."""
    if psi < 50:
        window = 19 - (psi / 50) * 4
    elif psi < 120:
        window = 14 - ((psi - 50) / 70) * 4
    elif psi < 200:
        window = 9 - ((psi - 120) / 80) * 4
    else:
        window = 4 - (min(psi - 200, 130) / 130) * 3

    return round(max(1.0, min(19.0, window)), 2)


def _model_features(data: dict[str, Any]) -> dict[str, float]:
    """Map unified input names to the trained model feature order."""
    cleaned = _clean_data(data)
    return {
        "entryRate": float(cleaned["entryRate"]),
        "density": float(cleaned["density"]),
        "transportArrivalBurst": float(cleaned["transportArrivalBurst"]),
        "vehicleCount": float(cleaned["vehicleCount"]),
        "exitRate": float(cleaned["exitRate"]),
        "width": float(cleaned["width"]),
    }


def _normalize_ml_label(label: Any) -> str | None:
    value = str(label).strip().lower()
    for risk in RISK_ORDER:
        if value == risk.lower():
            return risk
    return None


def predict_ml(data: dict[str, Any]) -> str | None:
    """
    Return optional ML risk prediction.

    PSI remains the main source of truth. ML failures return None instead of
    crashing the API.
    """
    if MODEL is None:
        return None

    try:
        features = _model_features(data)
        frame = pd.DataFrame(
            [[
                features["entryRate"],
                features["density"],
                features["transportArrivalBurst"],
                features["vehicleCount"],
                features["exitRate"],
                features["width"],
            ]],
            columns=[
                "entryRate",
                "density",
                "transportArrivalBurst",
                "vehicleCount",
                "exitRate",
                "width",
            ],
        )
        prediction = MODEL.predict(frame)[0]
        normalized = _normalize_ml_label(prediction)
        if normalized:
            return normalized
        if str(prediction).strip() in {"0", "1", "2", "3"}:
            return ["Low", "Moderate", "High", "Critical"][int(prediction)]
        return None
    except Exception:
        return None


def generate_reason(data: dict[str, Any], psi_risk: str, ml_risk: str | None = None) -> str:
    """Create short explainability text from PSI drivers."""
    cleaned = _clean_data(data)
    reasons: list[str] = []

    entry_flow = float(cleaned["entryRate"])
    exit_flow = float(cleaned["exitRate"])
    net_inflow = max(0.0, entry_flow - exit_flow)
    weather_penalty = encode_weather(str(cleaned["weather"]))

    density = float(cleaned["density"])
    vehicle_count = float(cleaned["vehicleCount"])
    arrival_burst = float(cleaned["transportArrivalBurst"])
    festival_peak = float(cleaned["festivalPeak"])

    if density >= 4:
        reasons.append(f"High density ({density:g} pax/m2)")
    if net_inflow > 0:
        reasons.append(f"High inflow ({net_inflow:g} pax/min net)")
    if arrival_burst > 0:
        reasons.append(f"Transport burst ({arrival_burst:g})")
    if festival_peak > 0:
        reasons.append(f"Festival crowd ({festival_peak:g})")
    if weather_penalty > 0:
        reasons.append(f"Adverse weather ({cleaned['weather']})")
    if vehicle_count > 0:
        reasons.append(f"Vehicle congestion ({vehicle_count:g})")

    if not reasons:
        reasons.append("Stable crowd conditions")

    reason = ", ".join(reasons)
    if ml_risk and RISK_ORDER[ml_risk] > RISK_ORDER[psi_risk]:
        reason += f". ML model also flags {ml_risk} risk"

    return reason


def get_spike_type(data: dict[str, Any]) -> str:
    cleaned = _clean_data(data)
    net_inflow = max(0.0, float(cleaned["entryRate"]) - float(cleaned["exitRate"]))

    if float(cleaned["transportArrivalBurst"]) > 0 and net_inflow > 0:
        return "TRANSPORT_SURGE"
    if float(cleaned["festivalPeak"]) > 0:
        return "FESTIVAL_PEAK"
    if float(cleaned["density"]) >= 4:
        return "DENSITY_SPIKE"
    if net_inflow > 0:
        return "INFLOW_SURGE"
    return "STABLE_FLOW"


def get_prediction_result(data: dict[str, Any]) -> dict[str, float | str]:
    """Build the final API response."""
    cleaned = _clean_data(data)
    psi = calculate_psi(cleaned)
    risk_level = get_risk_level(psi)
    ml_risk = predict_ml(cleaned)
    final_risk = ml_risk if ml_risk else risk_level

    return {
        "pressure_index": psi,
        "risk_level": final_risk,
        "predicted_crush_window_min": get_crush_window(psi),
        "spike_type": get_spike_type(cleaned),
        "reason": generate_reason(cleaned, risk_level, ml_risk),
    }
