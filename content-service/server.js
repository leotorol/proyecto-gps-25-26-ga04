require('dotenv').config();
const express = require('express');
const compression = require('compression');
const pinoHttp = require('pino-http');
const logger = require('./utils/logger'); 
const connectDB = require('./config/db');
const albumRoutes = require('./routes/AlbumRoutes');
const artistRoutes = require('./routes/ArtistRoutes');
const noticiasMusica = require('./routes/NewsRoutes');
const MerchRoutes = require('./routes/MerchandisingRoutes');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('node:path');
const fs = require('node:fs');
const { exec, spawn } = require('node:child_process');
const readline = require('node:readline');
const Stripe = require('stripe');
const { generalLimiter, checkoutLimiter } = require('./middleware/rateLimit');

mongoose.set('strictQuery', false);

//Tarea GA04-52-H24.2-Pruebas-unitarias-de-test-para-Estadísticas legada

const app = express();

app.use(compression());

// HTTP request logging
app.use(pinoHttp({ logger, autoLogging: true }));

// CORS: orígenes configurables por env (comma-separated). Fallback a http://localhost:3000
const rawOrigins = process.env.CORS_ORIGINS || 'http://localhost:3000';
const CORS_ORIGINS = rawOrigins.split(',').map(o => o.trim());
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

app.use('/assets', express.static(path.join(__dirname, 'assets')));

// Conectar a MongoDB para content-service
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL;
if (!MONGO_URI) {
  logger.warn('MONGO_URI no definida');
}
connectDB(MONGO_URI);

// Stripe init
const stripeKey = process.env.STRIPE_SECRET_KEY || '';
if (!stripeKey) {
  logger.warn('STRIPE_SECRET_KEY no definida');
}
const stripe = Stripe(stripeKey);

// Swagger: sólo especificación de contenidos
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'UnderSounds — Content Service API',
      version: '1.0.0',
      description: 'API para contenidos: albums, artists, merchandising y noticias'
    },
    servers: [
      { url: `http://localhost:${process.env.PORT || 5001}/api` }
    ]
  },
  apis: ['./docs/Contenidos.yaml']
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

app.use(generalLimiter);

// Rutas del content-service
app.use('/api/albums', albumRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/noticias', noticiasMusica);
app.use('/api/merchandising', MerchRoutes);

// Exponer un index estático simple si es necesario
app.use(express.static(path.join(__dirname, 'view')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'view', 'index.html'));
});

const PORT = process.env.PORT || 5001;
const startServer = () => {
  app.listen(PORT, () => {
    logger.info({ port: PORT }, 'Content-service iniciado');
  });
};

// ----- Gestión de metadata / importación local -----
const sharedMetaFile = path.join(__dirname, 'config', 'dbmeta.json');
const localMetaFile = path.join(__dirname, 'config', 'dbmeta_local.json');

const getVersionFromFile = (filePath) => {
  let version = 0;
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      version = parsed.dbVersion || 0;
    } else if (filePath === localMetaFile) {
        fs.writeFileSync(filePath, JSON.stringify({ dbVersion: 0, colecciones: [] }, null, 2));
        logger.info({ filePath }, 'Archivo meta creado');
        return 0;
      }
    }
  catch (err) {
    logger.error({ err, filePath }, 'Error leyendo archivo meta');
  }
  return version;
};

const updateVersionFile = (filePath, newVersion, newColecciones = null) => {
  let meta = {};
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      meta = JSON.parse(data);
    }
  } catch (err) {
    logger.error({ err, filePath }, 'Error leyendo archivo meta');
  }
  meta.dbVersion = newVersion;
  if (newColecciones !== null) {
    meta.colecciones = newColecciones;
  }
  fs.writeFileSync(filePath, JSON.stringify(meta, null, 2));
  logger.info({ filePath, newVersion, colecciones: meta.colecciones }, 'Archivo meta actualizado');
};

const CURRENT_DB_VERSION = getVersionFromFile(sharedMetaFile);

const checkAndImportData = () => {
  const localVersion = getVersionFromFile(localMetaFile);
  if (localVersion < CURRENT_DB_VERSION) {
    logger.info('Version local desactualizada, ejecutando mongoimport...');
    exec('npm run mongoimport', (err, stdout, stderr) => {
      if (err) {
        logger.error({ err }, 'Error ejecutando mongoimport');
        startServer();
      } else {
        logger.info({ stdout }, 'mongoimport completado');
        let currentCollections = [];
        try {
          const metaData = fs.existsSync(sharedMetaFile) ? JSON.parse(fs.readFileSync(sharedMetaFile, 'utf8')) : {};
          currentCollections = metaData.colecciones || [];
        } catch (e) {
          logger.error({ err: e }, 'Error leyendo colecciones');
        }
        updateVersionFile(sharedMetaFile, CURRENT_DB_VERSION, currentCollections);
        updateVersionFile(localMetaFile, CURRENT_DB_VERSION, currentCollections);
        startServer();
      }
    });
  } else {
    logger.info('BD actualizada');
    startServer();
  }
};

// Backups on exit (optional)
process.on('SIGINT', () => {
  process.stdout.write('Se detectó el cierre del proceso — iniciando cierre...\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question("¿Desea respaldar los datos con mongoexport? (S/N): ", (answer) => {
    if (answer.trim().toUpperCase() === "S") {
      process.stdout.write('Ejecutando mongoexport para respaldar datos...\n');
      const child = spawn('node', ['export-db.js'], { stdio: 'inherit' });
      child.on('exit', (code) => {
        process.stdout.write(`Exportación de datos completada con código ${code}\n`);
        const newVersion = CURRENT_DB_VERSION + 1;
        let currentCollections = [];
        try {
          const metaData = fs.existsSync(sharedMetaFile) ? JSON.parse(fs.readFileSync(sharedMetaFile, 'utf8')) : {};
          currentCollections = metaData.colecciones || [];
        } catch (e) {
          logger.error(e);
        }
        updateVersionFile(sharedMetaFile, newVersion, currentCollections);
        updateVersionFile(localMetaFile, newVersion, currentCollections);
        rl.close();
        process.exit();
      });
    } else {
      process.stdout.write('No se realizará el respaldo de datos. Cerrando...\n');
      rl.close();
      process.exit();
    }
  });
});

// Health check
app.get('/healthz', async (req, res) => {
  const health = {
    status: 'ok',
    service: 'content-service',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // 1. Check MongoDB
  try {
    const dbState = mongoose.connection.readyState;
    if (dbState === 1) {
      await mongoose.connection.db.admin().ping();
      health.checks.mongodb = { status: 'ok' };
    } else {
      health.checks.mongodb = { status: 'error', detail: `readyState=${dbState}` };
      health.status = 'degraded';
    }
  } catch (err) {
    health.checks.mongodb = { status: 'error', detail: err.message };
    health.status = 'degraded';
  }

  // 2. Check memoria
  try {
    const memUsage = process.memoryUsage();
    const heapMB = Math.round(memUsage.heapUsed / (1024 * 1024));
    const rssMB = Math.round(memUsage.rss / (1024 * 1024));
    health.checks.memory = {
      status: heapMB < 500 ? 'ok' : 'warning',
      heap_mb: heapMB,
      rss_mb: rssMB
    };
    if (heapMB >= 500) health.status = 'degraded';
  } catch (err) {
    health.checks.memory = { status: 'unknown', detail: err.message };
  }

  // 3. Check Stripe configurado
  health.checks.stripe = {
    status: stripeKey ? 'ok' : 'warning',
    configured: !!stripeKey
  };

  // 4. Check uptime
  health.checks.uptime = {
    status: 'ok',
    seconds: Math.floor(process.uptime())
  };

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// Create checkout session (Stripe)
app.post('/create-checkout-session', checkoutLimiter, async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items missing or invalid' });
  }

  let lineItems;
  try {
    lineItems = items.map(item => {
      if (typeof item.price !== 'number' || typeof item.quantity !== 'number') {
        throw new TypeError('Invalid item format: price and quantity must be numbers');
      }
      return {
        price_data: {
          currency: 'eur',
          product_data: {
            name: item.name || 'product',
            // images: item.image ? [item.image] : undefined,
          },
          unit_amount: Math.round(item.price * 100), // en céntimos
        },
        quantity: item.quantity,
      };
    });
  } catch (err) {
    logger.error({ err }, 'Error building lineItems');
    return res.status(400).json({ error: err.message });
  }

  if (!stripeKey) {
    logger.error('Stripe secret key no configurada');
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: 'http://localhost:3000/paymentSuccess',
      cancel_url: 'http://localhost:3000/',
    });
    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, 'Stripe checkout error');
    const message = err?.message || err?.raw?.message || 'Stripe error';
    res.status(500).json({ error: message });
  }
});

// Iniciar check/import y servidor
checkAndImportData();