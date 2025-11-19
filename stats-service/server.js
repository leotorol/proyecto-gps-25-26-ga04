require('dotenv').config();
const express = require('express');
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
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const readline = require('readline');
const Stripe = require('stripe');

mongoose.set('strictQuery', false);
// Tarea GA04-49-H23.1.2 legada
const app = express();

// CORS: orígenes configurables por env (comma-separated). Fallback a http://localhost:3000
const rawOrigins = process.env.CORS_ORIGINS || 'http://localhost:3000';
const CORS_ORIGINS = rawOrigins.split(',').map(o => o.trim());
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Servir assets (opcional — conserva si quieres servir imágenes desde este servicio)
app.use('/assets', express.static(path.join(__dirname, '../undersounds-frontend/src/assets')));

// Conectar a MongoDB para content-service
const MONGO_URI = process.env.MONGO_URI || process.env.MONGO_URL;
if (!MONGO_URI) {
  console.warn('MONGO_URI no definida. connectDB será llamada con valor undefined.');
}
connectDB(MONGO_URI);

// Stripe init
const stripeKey = process.env.STRIPE_SECRET_KEY || '';
if (!stripeKey) {
  console.error('WARNING: STRIPE_SECRET_KEY no definida en environment variables. create-checkout-session fallará hasta definirla.');
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
    console.log(`Content-service corriendo en el puerto ${PORT}`);
  });
};

// ----- Gestión de metadata / importación local (mantener útil para dev) -----
const sharedMetaFile = path.join(__dirname, 'config', 'dbmeta.json');
const localMetaFile = path.join(__dirname, 'config', 'dbmeta_local.json');

const getVersionFromFile = (filePath) => {
  let version = 0;
  try {
    if (!fs.existsSync(filePath)) {
      if (filePath === localMetaFile) {
        fs.writeFileSync(filePath, JSON.stringify({ dbVersion: 0, colecciones: [] }, null, 2));
        console.log(`${filePath} no existía, se ha creado con valor 0 y colecciones vacías.`);
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

// Backups on exit (optional)
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

// Health check (useful)
app.get('/healthz', (req, res) => {
  res.json({ status: 'ok', service: 'content-service', port: PORT });
});

// Create checkout session (Stripe)
app.post('/create-checkout-session', async (req, res) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'items missing or invalid' });
  }

  let lineItems;
  try {
    lineItems = items.map(item => {
      if (typeof item.price !== 'number' || typeof item.quantity !== 'number') {
        throw new Error('Invalid item format: price and quantity must be numbers');
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
    console.error('Error building lineItems:', err);
    return res.status(400).json({ error: err.message });
  }

  if (!stripeKey) {
    console.error('Stripe secret key no configurada. Abortando create-checkout-session.');
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
    console.error('Stripe/create-checkout-session error:', err);
    // If Stripe provides a raw error message, include it; otherwise a generic message
    const message = err && (err.message || (err.raw && err.raw.message)) ? (err.message || err.raw.message) : 'Stripe error';
    res.status(500).json({ error: message });
  }
});

// Iniciar check/import y servidor
checkAndImportData();