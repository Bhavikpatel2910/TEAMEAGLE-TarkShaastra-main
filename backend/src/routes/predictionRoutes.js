const express = require('express');
const router = express.Router();
const { getPrediction, createPrediction } = require('../controllers/predictionController');

// GET prediction by corridor ID (existing)
router.get('/:id', getPrediction);

// POST new prediction (calls AI API)
router.post('/predict', createPrediction);
// Also accept POST at root for flexibility
router.post('/', createPrediction);

module.exports = router;