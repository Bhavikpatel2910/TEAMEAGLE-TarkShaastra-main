const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const logger = require('./utils/logger');

const authRoutes = require('./routes/authRoutes');
const corridorRoutes = require('./routes/corridorRoutes');
const alertRoutes = require('./routes/alertRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { createPrediction } = require('./controllers/predictionController');

const app = express();

connectDB();

const defaultOrigins = new Set([
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
]);

const configuredOrigins = String(process.env.FRONTEND_URLS || process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = new Set(configuredOrigins.length ? configuredOrigins : defaultOrigins);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
      return;
    }

    callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
  optionsSuccessStatus: 200,
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api', (req, res) => {
  res.json({
    name: 'StampedeShield Backend API',
    status: 'ok',
    health: '/api/health',
  });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/corridors', corridorRoutes);
app.use('/api/alerts', alertRoutes);
app.post('/api/predict', createPrediction);
app.use('/api/predictions', predictionRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl,
  });
});

app.use((err, req, res, next) => {
  logger.error('Unhandled API error', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

module.exports = app;
