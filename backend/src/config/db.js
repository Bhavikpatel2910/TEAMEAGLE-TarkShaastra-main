const mongoose = require('mongoose');
const logger = require('../utils/logger');

function isDbDisabled() {
  const flag = String(process.env.DISABLE_DB || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

const connectDB = async () => {
  if (isDbDisabled()) {
    logger.info('MongoDB disabled via DISABLE_DB=true - running in memory mode');
    return;
  }

  try {
    if (process.env.MONGO_URI) {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 10,
      });
      logger.info('MongoDB connected');
    } else {
      logger.info('MongoDB URI not configured - running in memory mode');
    }
  } catch (err) {
    logger.warn('MongoDB connection failed; continuing in memory mode', { message: err.message });
  }
};

module.exports = connectDB;
