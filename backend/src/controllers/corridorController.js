const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const Corridor = require('../models/Corridor');
const SensorData = require('../models/SensorData');
const { callAIPrediction } = require('../services/aiService');
const {
  getCorridor: getMemoryCorridor,
  listCorridors: listMemoryCorridors,
  listHistory: listMemoryHistory,
  saveAlert,
  saveCorridor,
  saveHistory,
} = require('../utils/runtimeStore');

function isDbConnected() {
  return mongoose.connection.readyState === 1;
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const ALLOWED_WEATHER = new Set(['Clear', 'Heat', 'Rain']);

function parseRequiredNumber(value, fieldName, min = 0, fallback = 0) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a valid number`);
  }

  if (parsed < min) {
    throw new Error(`${fieldName} must be at least ${min}`);
  }

  return parsed;
}

function normalizeWeather(value) {
  const raw = String(value || 'Clear').trim();
  if (!raw) return 'Clear';
  const normalized = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  if (!ALLOWED_WEATHER.has(normalized)) {
    throw new Error('weather must be one of: Clear, Heat, Rain');
  }
  return normalized;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getRiskLevel(pressure) {
  if (pressure < 50) return 'LOW';
  if (pressure < 120) return 'MODERATE';
  if (pressure < 200) return 'HIGH';
  return 'CRITICAL';
}

function getAlertLevel(pressure) {
  const risk = getRiskLevel(pressure);
  if (risk === 'CRITICAL') return 'CRITICAL';
  if (risk === 'HIGH') return 'WARNING';
  return null;
}

function buildAlertPayload(corridorId, pressure) {
  const level = getAlertLevel(Number(pressure));
  if (!level) return null;

  return {
    corridorId,
    level,
    message: level === 'CRITICAL' ? 'Crush risk imminent' : 'High crowd pressure detected',
  };
}

function buildSensorPayload(body = {}, width = 0.5) {
  const normalizedWeather = normalizeWeather(body.weather);
  const weatherPenaltyMap = { clear: 0, heat: 4, rain: 6 };
  const weatherPenalty = weatherPenaltyMap[normalizedWeather.trim().toLowerCase()] ?? 0;
  const entryRate = parseRequiredNumber(body.entryRate ?? body.entry_flow_rate_pax_per_min, 'entryRate', 0, 0);
  const exitRate = parseRequiredNumber(body.exitRate ?? body.exit_flow_rate_pax_per_min, 'exitRate', 0, 0);
  const density = parseRequiredNumber(body.density ?? body.queue_density_pax_per_m2, 'density', 0, 0);
  const vehicleCount = parseRequiredNumber(body.vehicleCount ?? body.vehicle_count, 'vehicleCount', 0, 0);
  const transportBurst = parseRequiredNumber(body.transportArrivalBurst ?? body.transport_arrival_burst ?? body.transportBurst, 'transportArrivalBurst', 0, 0);
  const festivalPeak = parseRequiredNumber(body.festivalPeak ?? body.festival_peak ?? body.festival, 'festivalPeak', 0, 0);
  const widthProvided = body.width ?? body.corridor_width_m;
  const normalizedWidth = widthProvided === undefined || widthProvided === null || widthProvided === ''
    ? Math.max(0.5, toNumber(width, width))
    : parseRequiredNumber(widthProvided, 'width', 0.5, Math.max(0.5, toNumber(width, width)));

  return {
    corridorId: String(body.corridorId || '').trim(),
    entryRate,
    exitRate,
    density,
    width: normalizedWidth,
    vehicleCount,
    transportBurst,
    transportArrivalBurst: transportBurst,
    weather: normalizedWeather,
    weatherPenalty,
    festival: festivalPeak,
    festivalPeak,
  };
}

function buildCorridorSnapshot(corridor, sensor = null) {
  const id = String(corridor.id || corridor._id);
  const cpi = sensor ? toNumber(sensor.cpi ?? sensor.pressureIndex, null) : null;
  const riskLevel = sensor?.riskLevel || sensor?.risk_level || (cpi === null ? 'LOW' : getRiskLevel(cpi));

  return {
    ...corridor,
    id,
    width: corridor.width ?? null,
    length: corridor.length ?? null,
    capacity: corridor.capacity ?? null,
    entryRate: sensor ? toNumber(sensor.entryRate, null) : null,
    exitRate: sensor ? toNumber(sensor.exitRate, null) : null,
    density: sensor ? toNumber(sensor.density, null) : null,
    vehicleCount: sensor ? toNumber(sensor.vehicleCount, null) : null,
    transportBurst: sensor ? toNumber(sensor.transportArrivalBurst ?? sensor.transportBurst, null) : null,
    festivalPeak: sensor ? toNumber(sensor.festivalPeak ?? sensor.festival, null) : null,
    cpi,
    pressure_index: cpi,
    risk_level: riskLevel,
    updatedAt: sensor?.timestamp || corridor.updatedAt || corridor.createdAt || null,
    latestSensor: sensor || null,
  };
}

exports.getCorridors = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(200).json(
        listMemoryCorridors().map((corridor) => ({
          ...corridor,
          id: String(corridor.id || corridor._id),
        }))
      );
    }

    const [corridors, sensorRows] = await Promise.all([
      Corridor.find().sort({ createdAt: -1, name: 1 }).lean(),
      SensorData.find().sort({ timestamp: -1 }).lean(),
    ]);

    const latestByCorridor = new Map();
    for (const row of sensorRows) {
      const corridorId = String(row.corridorId || '');
      if (corridorId && !latestByCorridor.has(corridorId)) {
        latestByCorridor.set(corridorId, row);
      }
    }

    res.json(
      corridors.map((corridor) =>
        buildCorridorSnapshot(corridor, latestByCorridor.get(String(corridor._id)))
      )
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch corridors', details: error.message });
  }
};

exports.createCorridor = async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().replace(/\s+/g, ' ');
    const width = toNumber(req.body.width, NaN);
    const length = toNumber(req.body.length, 0);
    const capacity = toNumber(req.body.capacity, 0);

    // Validate required fields
    if (!name) {
      return res.status(400).json({ error: 'Corridor name is required' });
    }
    if (Number.isNaN(width) || width < 0.5) {
      return res.status(400).json({ error: 'Width is required and must be at least 0.5 meters' });
    }
    if (capacity < 0) {
      return res.status(400).json({ error: 'Capacity cannot be negative' });
    }
    if (length < 0) {
      return res.status(400).json({ error: 'Length cannot be negative' });
    }

    const corridorPayload = { name, width, length, capacity };

    if (!isDbConnected()) {
      const duplicate = listMemoryCorridors().find(
        (corridor) => String(corridor.name || '').trim().toLowerCase() === name.toLowerCase()
      );
      if (duplicate) {
        return res.status(409).json({
          error: `Corridor "${name}" already exists`,
          conflictId: String(duplicate.id || duplicate._id),
        });
      }

      const corridor = saveCorridor(corridorPayload);
      return res.status(201).json(corridor);
    }

    // Check for duplicate name
    const existing = await Corridor.findOne({ name: new RegExp(`^${escapeRegExp(name)}$`, 'i') });
    if (existing) {
      return res.status(409).json({ 
        error: `Corridor "${name}" already exists`,
        conflictId: String(existing._id)
      });
    }

    const corridor = await Corridor.create(corridorPayload);
    res.status(201).json({
      id: String(corridor._id),
      ...corridor.toObject()
    });
  } catch (error) {
    if (error.code === 11000) {
      // MongoDB duplicate key error
      return res.status(409).json({ 
        error: `Corridor name already exists`,
        details: error.message
      });
    }
    res.status(500).json({ error: 'Failed to create corridor', details: error.message });
  }
};

exports.ingestSensorData = async (req, res) => {
  try {
    const corridorId = String(req.body.corridorId || '').trim();
    if (!corridorId) {
      return res.status(400).json({ error: 'corridorId is required' });
    }

    const corridor = !isDbConnected()
      ? getMemoryCorridor(corridorId)
      : await Corridor.findById(corridorId).lean();

    if (!corridor) {
      return res.status(404).json({ error: 'Corridor not found' });
    }

    let sensorPayload;
    try {
      sensorPayload = buildSensorPayload(req.body, corridor.width);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    const aiInput = {
      entryRate: sensorPayload.entryRate,
      exitRate: sensorPayload.exitRate,
      density: sensorPayload.density,
      width: sensorPayload.width,
      vehicleCount: sensorPayload.vehicleCount,
      transportArrivalBurst: sensorPayload.transportArrivalBurst,
      weather: sensorPayload.weather,
      festivalPeak: sensorPayload.festivalPeak,
    };
    const prediction = await callAIPrediction(aiInput);
    const pressure = toNumber(prediction?.pressure_index, NaN);
    const riskLevel = String(prediction?.risk_level || '').toUpperCase() || getRiskLevel(pressure);
    if (!Number.isFinite(pressure)) {
      return res.status(502).json({ error: 'Invalid AI prediction response' });
    }
    const alertPayload = buildAlertPayload(corridorId, pressure);

    if (!isDbConnected()) {
      const timestamp = new Date().toISOString();
      const sensorRow = saveHistory({
        ...sensorPayload,
        cpi: pressure,
        pressureIndex: pressure,
        riskLevel,
        timestamp,
      });
      const corridorSnapshot = buildCorridorSnapshot(corridor, sensorRow);
      saveCorridor(corridorSnapshot);
      const alert = alertPayload ? saveAlert(alertPayload) : null;

      return res.status(201).json({
        success: true,
        corridorId,
        pressure,
        pressure_index: pressure,
        cpi: pressure,
        risk_level: riskLevel,
        data: sensorRow,
        alert,
      });
    }

    const data = await SensorData.create({
      ...sensorPayload,
      cpi: pressure,
      pressureIndex: pressure,
      riskLevel,
      timestamp: new Date(),
    });

    const alert = alertPayload ? await Alert.create(alertPayload) : null;

    res.status(201).json({
      success: true,
      corridorId,
      pressure,
      pressure_index: pressure,
      cpi: pressure,
      risk_level: riskLevel,
      data,
      alert,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save sensor data', details: error.message });
  }
};

exports.getCorridorHistory = async (req, res) => {
  try {
    const corridorId = String(req.params.id || '').trim();
    const limit = Math.max(1, Math.min(100, toNumber(req.query.limit, 20)));

    if (!corridorId) {
      return res.status(400).json({ error: 'corridor id is required' });
    }

    if (!isDbConnected()) {
      return res.json(listMemoryHistory(corridorId, limit));
    }

    const history = await SensorData.find({ corridorId })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json(history.reverse());
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch corridor history', details: error.message });
  }
};

exports.getCorridorById = async (req, res) => {
  try {
    const corridorId = String(req.params.id || '').trim();
    if (!corridorId) {
      return res.status(400).json({ error: 'corridor id is required' });
    }

    if (!isDbConnected()) {
      const corridor = getMemoryCorridor(corridorId);
      if (!corridor) {
        return res.status(404).json({ error: 'Corridor not found' });
      }

      const history = listMemoryHistory(corridorId, 20);
      return res.json({
        ...buildCorridorSnapshot(corridor, history[history.length - 1] || null),
        history,
      });
    }

    const corridor = await Corridor.findById(corridorId).lean();
    if (!corridor) {
      return res.status(404).json({ error: 'Corridor not found' });
    }

    const history = await SensorData.find({ corridorId })
      .sort({ timestamp: -1 })
      .limit(20)
      .lean();

    res.json({
      ...buildCorridorSnapshot(corridor, history[0] || null),
      history: history.reverse(),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch corridor', details: error.message });
  }
};

exports.addSensorData = exports.ingestSensorData;
