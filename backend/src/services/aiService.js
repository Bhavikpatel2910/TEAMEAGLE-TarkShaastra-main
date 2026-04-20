const axios = require('axios');

const AI_API_URL = process.env.AI_API_URL || 'http://localhost:5000';

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

    return response.data;
  } catch (error) {
    if (error.response) {
      // AI API returned an error response
      throw new Error(`AI API Error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
    } else if (error.request) {
      // No response from AI API
      throw new Error(`AI API unreachable at ${AI_API_URL}. Make sure the AI service is running.`);
    } else {
      throw new Error(`Error calling AI API: ${error.message}`);
    }
  }
};
