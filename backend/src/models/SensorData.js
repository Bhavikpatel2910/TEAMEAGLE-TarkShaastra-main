const mongoose = require('mongoose');

const sensorSchema = new mongoose.Schema({
  corridorId: { type: String, required: true, index: true },
  entryRate: { type: Number, default: 0, min: 0 },
  exitRate: { type: Number, default: 0, min: 0 },
  density: { type: Number, default: 0, min: 0 },
  width: { type: Number, default: 0.5, min: 0.5 },
  vehicleCount: { type: Number, default: 0, min: 0 },
  transportBurst: { type: Number, default: 0, min: 0 },
  transportArrivalBurst: { type: Number, default: 0, min: 0 },
  weather: { type: mongoose.Schema.Types.Mixed, default: 'Clear' },
  weatherPenalty: { type: Number, default: 0, min: 0 },
  festival: { type: Number, default: 0, min: 0 },
  festivalPeak: { type: Number, default: 0, min: 0 },
  cpi: { type: Number, default: 0, min: 0 },
  pressureIndex: { type: Number, default: 0, min: 0 },
  riskLevel: { type: String, default: 'LOW' },
  timestamp: { type: Date, default: Date.now, index: true }
}, { strict: false });

// Composite index for fast corridor + time queries
sensorSchema.index({ corridorId: 1, timestamp: -1 });

module.exports = mongoose.model('SensorData', sensorSchema);
