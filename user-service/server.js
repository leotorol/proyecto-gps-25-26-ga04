require('dotenv').config();
const express = require('express');
const connectDB = require('./config/db');
const accountRoutes = require('./routes/AccountRoutes');
const passport = require('./config/passport');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const readline = require('readline');
const session = require('express-session');
const { generalLimiter } = require('./middleware/rateLimit');
const { sanitizeBody, sanitizeQuery } = require('./middleware/sanitize');

mongoose.set('strictQuery', false);

const app = express();

// Tarea GA04-47 H21.2 CORS y validación input Legada

//TAREA GA04-54 H25.2 LEGADA
// CORS - permitir orígenes configurables
const CORS_ORIGINS = process.env.CORS_ORIGINS.split(',');
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Sanitización de inputs silenciosa
app.use(sanitizeBody);
app.use(sanitizeQuery);

app.use(session({
  secret: process.env.SESSION_SECRET || 'undersounds_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

const MONGO_URI = process.env.MONGO_URI;
connectDB(MONGO_URI);

// Configuración Swagger (solo Usuarios)
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'UnderSounds - User Service API',
      version: '1.0.0',
      description: 'Documentación del User Service (Autenticación y gestión de cuentas)'
    },
    servers: [
      { url: `http://localhost:${process.env.PORT || 5001}/api` }
    ]
  },
  apis: ['./docs/Usuarios.yaml']
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Rutas del user-service (auth)
app.use(generalLimiter);
app.use('/api/auth', accountRoutes);

// Mantener la funcionalidad de metadata/import si la quieres en cada servicio
const sharedMetaFile = path.join(__dirname, 'config', 'dbmeta.json');
const localMetaFile = path.join(__dirname, 'config', 'dbmeta_local.json');

const getVersionFromFile = (filePath) => {
  let version = 0;
  try {
    if (!fs.existsSync(filePath)) {
      if (filePath === localMetaFile) {
        fs.writeFileSync(filePath, JSON.stringify({ dbVersion: 0, colecciones: [] }, null, 2));
        return 0;
      }
    } else {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      version = parsed.dbVersion || 0;
    }
  } catch (err) {
    console.error(`Error leyendo ${filePath}:`, err);
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
    console.error(`Error leyendo ${filePath}:`, err);
  }
  meta.dbVersion = newVersion;
  if (newColecciones !== null) {
    meta.colecciones = newColecciones;
  }
  fs.writeFileSync(filePath, JSON.stringify(meta, null, 2));
  console.log(`${filePath} actualizado a la versión ${newVersion} con colecciones:`, meta.colecciones);
};

const CURRENT_DB_VERSION = getVersionFromFile(sharedMetaFile);

const checkAndImportData = () => {
  const localVersion = getVersionFromFile(localMetaFile);
  if (localVersion < CURRENT_DB_VERSION) {
    console.log("La versión local es antigua o no existe. Ejecutando mongoimport...");
    exec('npm run mongoimport', (err, stdout, stderr) => {
      if (err) {
        console.error("Error ejecutando mongoimport:", err);
        startServer();
      } else {
        console.log("mongoimport completado:", stdout);
        let currentCollections = [];
        try {
          const metaData = fs.existsSync(sharedMetaFile) ? JSON.parse(fs.readFileSync(sharedMetaFile, 'utf8')) : {};
          currentCollections = metaData.colecciones || [];
        } catch (e) {
          console.error(e);
        }
        updateVersionFile(sharedMetaFile, CURRENT_DB_VERSION, currentCollections);
        updateVersionFile(localMetaFile, CURRENT_DB_VERSION, currentCollections);
        startServer();
      }
    });
  } else {
    console.log("La BD ya está actualizada.");
    startServer();
  }
};

// Health check completo
app.get('/healthz', async (req, res) => {
  const health = {
    status: 'ok',
    service: 'user-service',
    timestamp: new Date().toISOString(),
    checks: {}
  };

  // 1. Check MongoDB
  try {
    const dbState = mongoose.connection.readyState;
    // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
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

  // 3. Check uptime
  health.checks.uptime = {
    status: 'ok',
    seconds: Math.floor(process.uptime())
  };

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

process.on('SIGINT', () => {
  console.log("Se detectó el cierre del proceso.");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  rl.question("¿Desea respaldar los datos con mongoexport? (S/N): ", (answer) => {
    if (answer.trim().toUpperCase() === "S") {
      console.log("Ejecutando mongoexport para respaldar datos...");
      const child = spawn('node', ['export-db.js'], { stdio: 'inherit' });
      child.on('exit', (code) => {
        console.log(`\nExportación de datos completada con código ${code}`);
        const newVersion = CURRENT_DB_VERSION + 1;
        let currentCollections = [];
        try {
          const metaData = fs.existsSync(sharedMetaFile) ? JSON.parse(fs.readFileSync(sharedMetaFile, 'utf8')) : {};
          currentCollections = metaData.colecciones || [];
        } catch (e) {
          console.error(e);
        }
        updateVersionFile(sharedMetaFile, newVersion, currentCollections);
        updateVersionFile(localMetaFile, newVersion, currentCollections);
        rl.close();
        process.exit();
      });
    } else {
      console.log("No se realizará el respaldo de datos.");
      rl.close();
      process.exit();
    }
  });
});

const PORT = process.env.PORT || 5001;
const startServer = () => {
  app.listen(PORT, () => {
    console.log(`User-service corriendo en el puerto ${PORT}`);
  });
};

// Iniciar check/import y servidor
checkAndImportData();