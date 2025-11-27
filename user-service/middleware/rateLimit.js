const rateLimit = require('express-rate-limit');

// Límite general (100 req/min por IP)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: Number.parseInt(process.env.RATE_LIMIT_GENERAL) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta de nuevo más tarde' }
});

// Límite estricto para auth (20 req/min por IP) - protege login/register/forgot
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_AUTH) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de autenticación, intenta en 1 minuto' },
  skipSuccessfulRequests: false
});

// Límite muy estricto para OTP/reset (5 req/min)
const otpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_OTP) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos, espera 1 minuto' }
});

module.exports = { generalLimiter, authLimiter, otpLimiter };