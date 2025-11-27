const AlbumDao = require('../model/dao/AlbumDAO');
const AlbumDTO = require('../model/dto/AlbumDTO');
const AlbumFactory = require('../model/factory/AlbumFactory');
const { Artist } = require('../model/models/Artistas');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const archiver = require('archiver');
const audioConverter = require('../services/AudioConverterService');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const MUSIC_FILES_PATH = path.join(process.cwd(), 'assets', 'music');

// ============================================================
// FUNCIONES AUXILIARES 
// ============================================================

/**
 * Pobla datos del artista en un álbum
 */
async function populateArtistData(album, fields = 'name bandName profileImage') {
  if (!album.artist?._id) return;
  
  try {
    const artistData = await Artist.findById(album.artist._id).select(fields);
    if (artistData) {
      album.artist.name = artistData.name || artistData.bandName || 'Unknown Artist';
      album.artist.profileImage = artistData.profileImage;
      if (artistData.genre) album.artist.genre = artistData.genre;
      if (artistData.bio) album.artist.bio = artistData.bio;
    }
  } catch (err) {
    logger.warn({ err: err.message, albumId: album._id }, 'Error poblando artista');
  }
}

/**
 * Extrae un ObjectId válido de diferentes formatos de artistId
 */
function extractArtistId(artistIdValue) {
  if (typeof artistIdValue !== 'string') {
    return artistIdValue?._id?.toString() ?? artistIdValue;
  }

  // Patrón: ObjectId("...")
  const objectIdRegex = /ObjectId\("([a-f0-9]{24})"\)/;
  const objectIdMatch = objectIdRegex.exec(artistIdValue);
  if (objectIdMatch?.[1]) {
    return objectIdMatch[1];
  }

  // Patrón: cualquier ID de 24 caracteres hex entre comillas
  const quotedIdRegex = /"([a-f0-9]{24})"/;
  const quotedMatch = quotedIdRegex.exec(artistIdValue);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  // Si es un objeto JSON-like, intentar extraer _id
  if (artistIdValue.startsWith('{') && artistIdValue.includes('_id')) {
    const cleanedString = artistIdValue
      .replaceAll(/([a-zA-Z0-9]+):/g, '"$1":')
      .replaceAll("'", '"');
    
    const idInJsonRegex = /"_id"\s*:\s*(?:new ObjectId\()?["']([a-f0-9]{24})["']/i;
    const jsonMatch = idInJsonRegex.exec(cleanedString);
    if (jsonMatch?.[1]) {
      return jsonMatch[1];
    }

    // Último intento: cualquier ID de 24 caracteres
    const anyIdRegex = /([a-f0-9]{24})/;
    const anyMatch = anyIdRegex.exec(cleanedString);
    if (anyMatch?.[1]) {
      return anyMatch[1];
    }
  }

  return artistIdValue;
}

/**
 * Procesa los archivos de tracks del request
 */
function processTrackFiles(files, albumData) {
  if (!files?.tracks) return [];

  let trackTitles = albumData.trackTitles || [];
  let trackDurations = albumData.trackDurations || [];
  let trackAutors = albumData.trackAutors || [];

  // Asegurar arrays
  if (!Array.isArray(trackTitles)) trackTitles = [trackTitles].filter(Boolean);
  if (!Array.isArray(trackDurations)) trackDurations = [trackDurations].filter(Boolean);
  if (!Array.isArray(trackAutors)) trackAutors = [trackAutors].filter(Boolean);

  return files.tracks.map((file, index) => ({
    id: index + 1,
    title: (trackTitles[index] || file.originalname).trim(),
    duration: (trackDurations[index] || '0:00').trim(),
    url: `http://localhost:5001/assets/music/${file.filename}`,
    autor: (trackAutors[index] || albumData.artistName || 'Unknown').trim(),
    n_reproducciones: 0
  }));
}

/**
 * Busca una pista en el álbum por ID (flexible)
 */
function findTrackById(tracks, trackId) {
  // Buscar por ID exacto
  let track = tracks.find(t => t.id === trackId);
  if (track) return track;

  // Buscar convirtiendo a string
  track = tracks.find(t => String(t.id) === String(trackId));
  if (track) return track;

  // Si es un índice válido
  const numericId = Number(trackId);
  if (!Number.isNaN(numericId) && numericId >= 0 && numericId < tracks.length) {
    return tracks[numericId];
  }

  return null;
}

/**
 * Busca un archivo de audio en el sistema de archivos
 */
function findAudioFile(filename, availableFiles) {
  const directPath = path.join(MUSIC_FILES_PATH, filename);
  
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  // Buscar coincidencia en archivos disponibles
  const files = availableFiles || fs.readdirSync(MUSIC_FILES_PATH);
  const matchingFile = files.find(file =>
    file.toLowerCase() === filename.toLowerCase() ||
    file.toLowerCase().includes(filename.toLowerCase())
  );

  return matchingFile ? path.join(MUSIC_FILES_PATH, matchingFile) : null;
}

/**
 * Convierte y envía un archivo de audio
 */
async function convertAndSendFile(res, inputPath, trackTitle, format) {
  const safeTitle = trackTitle.replaceAll(/[/\\:*?"<>|]/g, '_');

  // Si ya es MP3 y se pide MP3, enviar directo
  if (format === 'mp3' && inputPath.toLowerCase().endsWith('.mp3')) {
    return res.download(inputPath, `${safeTitle}.mp3`);
  }

  // Convertir a otro formato
  const outputPath = path.join(os.tmpdir(), `${trackTitle}-${Date.now()}.${format}`);

  try {
    await audioConverter.convertAudio(inputPath, outputPath, format);
    
    return res.download(outputPath, `${safeTitle}.${format}`, () => {
      fs.unlink(outputPath, () => {});
    });
  } catch (err) {
    logger.error({ err }, 'Error en conversión de audio');
    throw new Error('Error al convertir el archivo');
  }
}

/**
 * Convierte un archivo (copia si ya es el formato correcto)
 */
async function convertOrCopyFile(inputPath, outputPath, format) {
  if (format === 'mp3' && inputPath.toLowerCase().endsWith('.mp3')) {
    await fs.promises.copyFile(inputPath, outputPath);
  } else {
    await audioConverter.convertAudio(inputPath, outputPath, format);
  }
}

// ============================================================
// CONTROLLER
// ============================================================

class AlbumController {
  async getAlbums(req, res) {
    try {
      const filter = {};
      
      if (req.query.genre) {
        filter.genre = { $regex: req.query.genre, $options: 'i' };
      }
      const limit = req.query.limit ? Number.parseInt(req.query.limit) : 0;

      const albums = await AlbumDao.getAlbums(filter, { limit });
      
      await Promise.all(albums.map(album => populateArtistData(album)));
      
      const albumDTOs = albums.map(album => new AlbumDTO(album));
      res.json(albumDTOs);
    } catch (error) {
      logger.error({ err: error }, 'Error en getAlbums');
      res.status(500).json({ error: error.message });
    }
  }

  async getAlbumById(req, res) {
    try {
      const { id } = req.params;
      const album = await AlbumDao.getAlbumById(id);
      
      if (!album) {
        return res.status(404).json({ error: 'Album not found' });
      }
      
      await populateArtistData(album, 'name bandName profileImage genre bio');
      
      res.json(new AlbumDTO(album));
    } catch (error) {
      logger.error({ err: error }, 'Error en getAlbumById');
      res.status(500).json({ error: error.message });
    }
  }

  async createAlbum(req, res) {
    try {
      const albumData = req.body;

      if (!albumData.artistId) {
        return res.status(400).json({
          success: false,
          error: 'Se requiere el ID del artista (artistId)'
        });
      }

      // Extraer ID válido
      const artistIdValue = extractArtistId(albumData.artistId);

      if (!mongoose.Types.ObjectId.isValid(artistIdValue)) {
        return res.status(400).json({
          success: false,
          error: `ID de artista no válido: "${artistIdValue}"`
        });
      }

      // Asignar ObjectId
      albumData.artist = new mongoose.Types.ObjectId(artistIdValue);

      // Convertir campos
      albumData.price = Number.parseFloat(albumData.price) || 9.99;
      albumData.releaseYear = Number.parseInt(albumData.releaseYear) || new Date().getFullYear();
      albumData.vinyl = albumData.vinyl === 'true' || albumData.vinyl === true;
      albumData.cd = albumData.cd === 'true' || albumData.cd === true;
      albumData.cassettes = albumData.cassettes === 'true' || albumData.cassettes === true;
      albumData.destacado = albumData.destacado === 'true' || albumData.destacado === true;

      // Procesar coverImage
      if (req.files?.coverImage?.[0]) {
        albumData.coverImage = `http://localhost:5001/assets/images/${req.files.coverImage[0].filename}`;
      }

      // Procesar tracks
      albumData.tracks = processTrackFiles(req.files, albumData);

      // Limpiar campos temporales
      delete albumData.trackTitles;
      delete albumData.trackDurations;
      delete albumData.trackAutors;
      delete albumData.artistName;

      // Crear álbum
      const albumEntity = AlbumFactory.createAlbum(albumData);

      if (!albumEntity.artist || !mongoose.Types.ObjectId.isValid(albumEntity.artist)) {
        return res.status(400).json({
          success: false,
          error: 'Error interno: Campo artist es inválido'
        });
      }

      const newAlbum = await AlbumDao.createAlbum(albumEntity);

      // Actualizar artista
      try {
        const artist = await Artist.findById(albumData.artist);
        if (artist) {
          artist.albums.push(newAlbum._id);
          await artist.save();
          logger.info({ albumId: newAlbum._id, artistId: artist._id }, 'Álbum añadido al artista');
        }
      } catch (artistError) {
        logger.warn({ err: artistError.message }, 'Error al actualizar artista');
      }

      delete albumData.artistId;

      res.status(201).json({
        success: true,
        message: 'Álbum creado exitosamente',
        album: new AlbumDTO(newAlbum)
      });

    } catch (error) {
      logger.error({ err: error }, 'Error en createAlbum');
      res.status(500).json({
        success: false,
        error: error.message || 'Error interno del servidor'
      });
    }
  }

  async updateAlbum(req, res) {
    try {
      const { id } = req.params;
      const albumData = req.body;
      const updatedAlbum = await AlbumDao.updateAlbum(id, albumData);
      
      if (!updatedAlbum) {
        return res.status(404).json({ error: 'Album not found' });
      }
      res.json(new AlbumDTO(updatedAlbum));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async deleteAlbum(req, res) {
    try {
      const { id } = req.params;
      const deletedAlbum = await AlbumDao.deleteAlbum(id);
      
      if (!deletedAlbum) {
        return res.status(404).json({ error: 'Album not found' });
      }
      res.json({ message: 'Album deleted successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async addRating(req, res) {
    try {
      const { id } = req.params;
      const { userId, rating, comment, profileImage } = req.body;
      const album = await AlbumDao.getAlbumById(id);
      
      if (!album) {
        return res.status(404).json({ success: false, error: 'Album not found' });
      }
      
      album.ratings.push({ userId, rating, comment, profileImage });
      await album.save();
      res.json({ success: true, album });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async downloadTrack(req, res) {
    try {
      const { id } = req.params;
      const format = req.query.format || 'mp3';
      const trackIdParam = req.query.trackId;
      const trackId = Number.isNaN(Number(trackIdParam)) ? trackIdParam : Number.parseInt(trackIdParam);

      if (!['mp3', 'wav', 'flac'].includes(format)) {
        return res.status(400).json({ error: 'Formato no válido. Use mp3, wav o flac.' });
      }

      const album = await AlbumDao.getAlbumById(id);
      if (!album) {
        return res.status(404).json({ error: 'Álbum no encontrado' });
      }

      const track = findTrackById(album.tracks, trackId);
      if (!track) {
        return res.status(404).json({
          error: 'Pista no encontrada en este álbum',
          details: `ID solicitado: ${trackId}, disponibles: ${album.tracks.map(t => t.id).join(', ')}`
        });
      }

      if (!track.url) {
        return res.status(404).json({ error: 'URL de audio no encontrada' });
      }

      const filename = track.url.split('/').at(-1);
      const audioPath = findAudioFile(filename);

      if (!audioPath) {
        const files = fs.readdirSync(MUSIC_FILES_PATH);
        return res.status(404).json({
          error: 'Archivo de audio no encontrado',
          details: `Buscando: ${filename}. Disponibles: ${files.join(', ')}`
        });
      }

      await convertAndSendFile(res, audioPath, track.title, format);

    } catch (error) {
      logger.error({ err: error }, 'Error en downloadTrack');
      res.status(500).json({
        error: 'Error al procesar la descarga',
        details: error.message
      });
    }
  }

  async downloadAlbum(req, res) {
    try {
      const { id } = req.params;
      const format = req.query.format || 'mp3';

      if (!['mp3', 'wav', 'flac'].includes(format)) {
        return res.status(400).json({ error: 'Formato no válido. Use mp3, wav o flac.' });
      }

      const album = await AlbumDao.getAlbumById(id);
      if (!album) {
        return res.status(404).json({ error: 'Álbum no encontrado' });
      }

      if (!album.tracks?.length) {
        return res.status(404).json({ error: 'Este álbum no tiene pistas' });
      }

      const safeAlbumTitle = album.title.replaceAll(/[/\\:*?"<>|]/g, '_');

      let availableFiles;
      try {
        availableFiles = fs.readdirSync(MUSIC_FILES_PATH);
      } catch (err) {
        logger.error({ err }, 'Error al leer directorio de música');
        return res.status(500).json({ error: 'Error al acceder a los archivos de música' });
      }

      const tempDir = path.join(os.tmpdir(), `album-${id}-${Date.now()}`);
      await fs.promises.mkdir(tempDir, { recursive: true });

      // Procesar cada track
      const conversionPromises = album.tracks
        .filter(track => track.url)
        .map(track => {
          const filename = track.url.split('/').at(-1);
          const audioPath = findAudioFile(filename, availableFiles);

          if (!audioPath) return Promise.resolve();

          const trackBaseName = track.title || `track-${track.id}`;
          const safeTrackBaseName = trackBaseName.replaceAll(/[/\\:*?"<>|]/g, '_');
          const outputPath = path.join(tempDir, `${safeTrackBaseName}.${format}`);
          return convertOrCopyFile(audioPath, outputPath, format).catch(err => {
            logger.error({ err, trackTitle: track.title }, 'Error convirtiendo track');
          });
        });

      await Promise.allSettled(conversionPromises);

      const files = await fs.promises.readdir(tempDir);
      if (files.length === 0) {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
        return res.status(500).json({ error: 'No se pudo generar ningún archivo' });
      }

      const zipPath = path.join(os.tmpdir(), `${safeAlbumTitle}-${format}-${Date.now()}.zip`);
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => {
        res.download(zipPath, `${safeAlbumTitle}.zip`, () => {
          fs.unlink(zipPath, () => {});
          fs.rm(tempDir, { recursive: true, force: true }, () => {});
        });
      });

      archive.on('error', (err) => {
        logger.error({ err }, 'Error creando ZIP');
        fs.rm(tempDir, { recursive: true, force: true }, () => {});
        res.status(500).json({ error: 'Error al crear el archivo ZIP' });
      });

      archive.pipe(output);
      archive.directory(tempDir, false);
      archive.finalize();

    } catch (error) {
      logger.error({ err: error }, 'Error en downloadAlbum');
      res.status(500).json({
        error: 'Error al procesar la descarga del álbum',
        details: error.message
      });
    }
  }
}

module.exports = new AlbumController();