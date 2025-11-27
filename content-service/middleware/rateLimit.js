const rateLimit = require('express-rate-limit');

// Límite general (150 req/min - más permisivo para contenido)
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_GENERAL) || 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta de nuevo más tarde' }
});

// Límite para escritura (POST/PUT/DELETE) - 30 req/min
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_WRITE) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Límite de escritura alcanzado, espera 1 minuto' }
});

// Límite para checkout de Stripe (10 req/min)
const checkoutLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number.parseInt(process.env.RATE_LIMIT_CHECKOUT) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de pago, espera 1 minuto' }
});

module.exports = { generalLimiter, writeLimiter, checkoutLimiter };