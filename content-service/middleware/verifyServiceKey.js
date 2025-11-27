const verifyServiceKey = (req, res, next) => {
  const key = req.header('x-service-api-key') || req.query['_service_key'] || req.body._service_key;
  const expected = process.env.SERVICE_API_KEY;
  if (!expected) {
    console.error('SERVICE_API_KEY no configurada en content-service.env');
    return res.status(500).json({ error: 'Service key not configured' });
  }
  if (!key || key !== expected) {
    return res.status(403).json({ error: 'Forbidden: invalid service key' });
  }
  next();
};

module.exports = verifyServiceKey;