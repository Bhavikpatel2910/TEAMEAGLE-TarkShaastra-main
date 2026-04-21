const WEATHER_PENALTIES = {
  clear: 0,
  heat: 4,
  rain: 6,
};

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeInput(data = {}) {
  const normalized = {
    entryRate: toNumber(data.entryRate ?? data.entry_flow_rate_pax_per_min, 0),
    exitRate: toNumber(data.exitRate ?? data.exit_flow_rate_pax_per_min, 0),
    density: toNumber(data.density ?? data.queue_density_pax_per_m2, 0),
    width: Math.max(0.5, toNumber(data.width ?? data.corridor_width_m, 0.5)),
    vehicleCount: toNumber(data.vehicleCount ?? data.vehicle_count, 0),
    transportArrivalBurst: toNumber(data.transportArrivalBurst ?? data.transport_arrival_burst, 0),
    weather: String(data.weather || 'Clear').trim().toLowerCase(),
    festivalPeak: toNumber(data.festivalPeak ?? data.festival_peak, 0),
  };

  for (const [key, value] of Object.entries(normalized)) {
    if (key !== 'weather' && value < 0) {
      throw new Error(`${key} cannot be negative`);
    }
  }

  if (!(normalized.weather in WEATHER_PENALTIES)) {
    throw new Error('weather must be one of: Clear, Heat, Rain');
  }

  return normalized;
}

function calculatePsi(data) {
  const normalized = normalizeInput(data);
  const netInflow = Math.max(0, normalized.entryRate - normalized.exitRate);
  const weatherPenalty = WEATHER_PENALTIES[normalized.weather];

  return Math.max(
    0,
    Math.round(
      (
        (8.7 * normalized.density)
        + (0.42 * (netInflow / normalized.width))
        + (1.9 * normalized.vehicleCount)
        + (10 * normalized.transportArrivalBurst)
        + (7 * normalized.festivalPeak)
        + weatherPenalty
      ) * 100
    ) / 100
  );
}

function getRiskLevel(psi) {
  if (psi < 50) return 'Low';
  if (psi < 120) return 'Moderate';
  if (psi < 200) return 'High';
  return 'Critical';
}

function getCrushWindow(psi) {
  if (psi < 50) {
    return 19 - (psi / 50) * 4;
  }

  if (psi < 120) {
    return 14 - ((psi - 50) / 70) * 4;
  }

  if (psi < 200) {
    return 9 - ((psi - 120) / 80) * 4;
  }

  return 4 - (Math.min(psi - 200, 130) / 130) * 3;
}

function getSpikeType(data) {
  const normalized = normalizeInput(data);
  const netInflow = Math.max(0, normalized.entryRate - normalized.exitRate);

  if (normalized.transportArrivalBurst > 0 && netInflow > 0) return 'TRANSPORT_SURGE';
  if (normalized.festivalPeak > 0) return 'FESTIVAL_PEAK';
  if (normalized.density >= 4) return 'DENSITY_SPIKE';
  if (netInflow > 0) return 'INFLOW_SURGE';
  return 'STABLE_FLOW';
}

function generateReason(data, riskLevel) {
  const normalized = normalizeInput(data);
  const reasons = [];
  const netInflow = Math.max(0, normalized.entryRate - normalized.exitRate);
  const weatherPenalty = WEATHER_PENALTIES[normalized.weather];
  const format = (value) => {
    const fixed = Number(value).toFixed(1);
    return fixed.endsWith('.0') ? fixed.slice(0, -2) : fixed;
  };

  if (normalized.density >= 4) reasons.push(`High density (${format(normalized.density)} pax/m2)`);
  if (netInflow > 0) reasons.push(`High inflow (${format(netInflow)} pax/min net)`);
  if (normalized.transportArrivalBurst > 0) reasons.push(`Transport burst (${format(normalized.transportArrivalBurst)})`);
  if (normalized.festivalPeak > 0) reasons.push(`Festival crowd (${format(normalized.festivalPeak)})`);
  if (weatherPenalty > 0) reasons.push(`Adverse weather (${normalized.weather.charAt(0).toUpperCase()}${normalized.weather.slice(1)})`);
  if (normalized.vehicleCount > 0) reasons.push(`Vehicle congestion (${format(normalized.vehicleCount)})`);

  if (!reasons.length) {
    reasons.push('Stable crowd conditions');
  }

  return {
    reason: reasons.join(', '),
    riskLevel,
  };
}

function getLocalPrediction(data) {
  const psi = calculatePsi(data);
  const psiRisk = getRiskLevel(psi);

  return {
    pressure_index: psi,
    risk_level: psiRisk,
    predicted_crush_window_min: Math.max(1, Math.min(19, Number(getCrushWindow(psi).toFixed(2)))),
    spike_type: getSpikeType(data),
    reason: generateReason(data, psiRisk).reason,
  };
}

module.exports = {
  calculatePsi,
  generateReason,
  getCrushWindow,
  getLocalPrediction,
  getRiskLevel,
  getSpikeType,
  normalizeInput,
};
