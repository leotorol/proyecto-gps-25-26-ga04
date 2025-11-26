/**
 * Middleware de sanitización silenciosa.
 * NO devuelve errores al frontend, solo limpia datos peligrosos.
 */

// Prevenir NoSQL injection: eliminar operadores $ de objetos
function sanitizeObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const clean = {};
  for (const [key, value] of Object.entries(obj)) {
    // Eliminar keys que empiecen con $ (operadores MongoDB)
    if (key.startsWith('$')) continue;
    clean[key] = sanitizeObject(value);
  }
  return clean;
}

// Middleware
function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
}

function sanitizeQuery(req, res, next) {
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  next();
}

module.exports = { sanitizeBody, sanitizeQuery };