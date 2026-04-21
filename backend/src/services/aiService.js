const axios = require('axios');
const logger = require('../utils/logger');
const { getLocalPrediction } = require('./predictionService');

const AI_API_URL = process.env.AI_API_URL || 'http://localhost:5000';

function hasValidPredictionShape(payload) {
  return payload
    && typeof payload.pressure_index === 'number'
    && typeof payload.predicted_crush_window_min === 'number'
    && typeof payload.risk_level === 'string'
    && typeof payload.reason === 'string';
}

/**
 * Call the AI API to get a prediction
 * @param {Object} predictionData - Input data for the AI model
 * @returns {Promise<Object>} - Prediction result from AI API
 */
exports.callAIPrediction = async (predictionData) => {
  try {
    const response = await axios.post(`${AI_API_URL}/predict`, predictionData, {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 10000, // 10 second timeout
    });

    if (hasValidPredictionShape(response.data)) {
      return response.data;
    }

    logger.warn('AI API returned an invalid payload; using local fallback', {
      url: AI_API_URL,
    });
  } catch (error) {
    logger.warn('AI API unavailable; using local prediction fallback', {
      url: AI_API_URL,
      message: error.message,
    });
  }

  const fallback = getLocalPrediction(predictionData);
  if (!hasValidPredictionShape(fallback)) {
    throw new Error('Local prediction fallback produced an invalid response');
  }

  return fallback;
};
