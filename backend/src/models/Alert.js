const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  corridorId: { type: String, index: true },
  level: String,
  message: String,
  acknowledged: { type: Boolean, default: false, index: true },
  createdAt: { type: Date, default: Date.now, index: true }
});

// Composite index for common queries
alertSchema.index({ corridorId: 1, acknowledged: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);