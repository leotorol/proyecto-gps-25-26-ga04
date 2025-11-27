const axios = require('axios');
const logger = require('./logger');

/**
 * HTTP request con retry automático
 * @param {Function} requestFn - Función que retorna una promesa de axios
 * @param {number} maxRetries - Número máximo de reintentos (default: 3)
 * @param {number} baseDelay - Delay base en ms (default: 1000)
 * @returns {Promise} - Respuesta de axios
 */
async function withRetry(requestFn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (err) {
      lastError = err;
      
      const isRetryable = 
        err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT' ||
        err.code === 'ENOTFOUND' ||
        (err.response && [502, 503, 504].includes(err.response.status));
      
      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.warn({ attempt, maxRetries, delay, error: err.message }, 'HTTP retry');
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

module.exports = { withRetry };