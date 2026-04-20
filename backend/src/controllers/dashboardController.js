const mongoose = require('mongoose');
const Alert = require('../models/Alert');
const Corridor = require('../models/Corridor');
const SensorData = require('../models/SensorData');
const {
  listAlerts: listMemoryAlerts,
  listCorridors: listMemoryCorridors,
} = require('../utils/runtimeStore');

function toNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getRiskLevel(pressure) {
  if (!Number.isFinite(pressure)) return 'LOW';
  if (pressure < 50) return 'LOW';
  if (pressure < 120) return 'MODERATE';
  if (pressure < 200) return 'HIGH';
  return 'CRITICAL';
}

function buildCorridorSnapshot(corridor, sensor = null) {
  const cpi = sensor ? toNumber(sensor.cpi ?? sensor.pressureIndex, null) : null;
  const riskLevel = sensor?.riskLevel || sensor?.risk_level || getRiskLevel(cpi);

  return {
    ...corridor,
    id: String(corridor.id || corridor._id),
    entryRate: sensor?.entryRate ?? null,
    exitRate: sensor?.exitRate ?? null,
    density: sensor?.density ?? null,
    vehicleCount: sensor?.vehicleCount ?? null,
    transportBurst: sensor?.transportArrivalBurst ?? sensor?.transportBurst ?? null,
    festivalPeak: sensor?.festivalPeak ?? sensor?.festival ?? null,
    cpi,
    pressure_index: cpi,
    risk_level: riskLevel,
    updatedAt: sensor?.timestamp || corridor.updatedAt || corridor.createdAt || null,
  };
}

exports.getDashboard = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        corridors: listMemoryCorridors(),
        alerts: listMemoryAlerts().filter((alert) => !alert.acknowledged),
      });
    }

    const [corridors, alerts, sensorRows] = await Promise.all([
      Corridor.find().sort({ createdAt: -1 }).lean(),
      Alert.find({ acknowledged: false }).sort({ createdAt: -1 }).lean(),
      SensorData.find().sort({ timestamp: -1 }).lean(),
    ]);

    const latestByCorridor = new Map();
    for (const row of sensorRows) {
      const corridorId = String(row.corridorId || '');
      if (corridorId && !latestByCorridor.has(corridorId)) {
        latestByCorridor.set(corridorId, row);
      }
    }

    res.json({
      corridors: corridors.map((corridor) =>
        buildCorridorSnapshot(corridor, latestByCorridor.get(String(corridor._id)))
      ),
      alerts,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load dashboard', details: error.message });
  }
};
