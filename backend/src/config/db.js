const mongoose = require('mongoose');

function isDbDisabled() {
  const flag = String(process.env.DISABLE_DB || '').trim().toLowerCase();
  return flag === '1' || flag === 'true' || flag === 'yes';
}

const connectDB = async () => {
  if (isDbDisabled()) {
    console.log('MongoDB disabled via DISABLE_DB=true - running in memory mode');
    return;
  }

  try {
    if (process.env.MONGO_URI) {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log('MongoDB connected');
    } else {
      console.log('MongoDB URI not configured - running in memory mode');
    }
  } catch (err) {
    console.error('MongoDB connection failed:', err.message);
    console.log('Continuing without database - API will still work');
  }
};

module.exports = connectDB;
