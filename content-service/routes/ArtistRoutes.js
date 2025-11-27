const express = require('express');
const router = express.Router();
const path = require('node:path');
const multer = require('multer');
const ArtistController = require('../controller/ArtistController');
const verifyServiceKey = require('../middleware/verifyServiceKey');

// Configuración de multer para manejar imágenes de perfil y banner
const storage = multer.diskStorage({
   destination: function (req, file, cb) {
    // Guardar las imágenes en la carpeta común de assets/images
    cb(null, path.join(__dirname, '../assets/images'));
  },
  filename: function (req, file, cb) {
    const cleanName = file.originalname.replaceAll(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + '-' + cleanName);
  }
});

const upload = multer({ storage });

// Definir rutas con el middleware de multer en create y update
router.get('/', ArtistController.getArtists);
router.get('/:id', ArtistController.getArtistById);

// PROTEGER con verifyServiceKey ANTES de multer para evitar uploads no autorizados
router.post(
  '/',
  verifyServiceKey,
  upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
  ]),
  ArtistController.createArtist
);

router.put(
  '/:id',
  verifyServiceKey,
  upload.fields([
    { name: 'profileImage', maxCount: 1 },
    { name: 'banner', maxCount: 1 }
  ]),
  ArtistController.updateArtist
);

// proteger eliminación también
router.delete('/:id', verifyServiceKey, ArtistController.deleteArtist);

module.exports = router;