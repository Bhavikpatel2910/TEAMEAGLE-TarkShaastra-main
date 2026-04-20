const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/authRoutes');
const corridorRoutes = require('./routes/corridorRoutes');
const alertRoutes = require('./routes/alertRoutes');
const predictionRoutes = require('./routes/predictionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { createPrediction } = require('./controllers/predictionController');

const app = express();

connectDB();

app.use(cors());
app.use(express.json());

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
  console.error('Unhandled API error:', err.message);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

module.exports = app;
