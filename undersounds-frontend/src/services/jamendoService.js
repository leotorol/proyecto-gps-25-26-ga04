import axios from 'axios';

// URL base para tus endpoints de álbumes y artistas
const ALBUM_BASE_URL = "http://localhost:5001/api/albums";
const ARTIST_BASE_URL = "http://localhost:5001/api/artists";

// Función para obtener álbumes (usando los endpoints de AlbumController)
export const fetchAlbums = async () => {
  try {
    const response = await axios.get(`${ALBUM_BASE_URL}`, {
      withCredentials: true,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching albums from AlbumController:', error);
    throw error;
  }
};

// Función para obtener artistas (usando los endpoints de AlbumController)
export const fetchArtistsList = async () => {
  try {
    const response = await axios.get(`${ARTIST_BASE_URL}`, {
      withCredentials: true,
    });
    return response.data.results || response.data;
  } catch (error) {
    console.error('Error fetching Artist from AlbumController:', error);
    throw error;
  }
};

// Función para obtener la información de un álbum por ID
export const fetchAlbumById = async (albumId) => {
  try {
    const response = await axios.get(`${ALBUM_BASE_URL}/${albumId}`, {
      withCredentials: true,
    });
    return response.data;
  } catch (error) {
    console.error(`Error fetching album with id ${albumId} from AlbumController:`, error);
    throw error;
  }
};

// Función para obtener las pistas de un álbum (se extrae del objeto álbum)
export const fetchTracklist = async (albumId) => {
  try {
    const album = await fetchAlbumById(albumId);
    return album.tracks || [];
  } catch (error) {
    console.error(`Error fetching tracklist for album ${albumId}:`, error);
    throw error;
  }
};

// Función para obtener artistas (agrega el endpoint correspondiente en tu backend)
export const fetchArtists = async () => {
  try {
    const response = await axios.get(`${ALBUM_BASE_URL}/artists`, {
      withCredentials: true,
    });
    return response.data;
  } catch (error) {
    console.error('Error fetching artists from AlbumController:', error);
    throw error;
  }
};

// ─────────────────────────────────────────────────────────────
// Helpers para reducir complejidad cognitiva de las descargas
// ─────────────────────────────────────────────────────────────

/** Sanitiza un nombre de archivo eliminando caracteres no permitidos */
const sanitizeFilename = (name) => name.replaceAll(/[/\\:*?"<>|]/g, '_');

/** Extrae el nombre de archivo del header Content-Disposition */
const extractFilenameFromHeader = (contentDisposition, fallback) => {
  if (!contentDisposition) {
    return fallback;
  }
  // Intentar patrón con comillas
  let match = contentDisposition.match(/filename="([^"]+)"/);
  if (!match) {
    // Intentar patrón sin comillas
    match = contentDisposition.match(/filename=([^;]+)/);
  }
  if (match?.[1]){
    return match[1].trim().replaceAll(/(^['"]+|['"]+$)/g, '');
  }
  return fallback;
};

/** Determina el MIME type según el formato de audio */
const getAudioMimeType = (format) => {
  if (format === 'mp3') return 'audio/mpeg';
  if (format === 'wav') return 'audio/wav';
  return 'audio/flac';
};

/** Dispara la descarga de un Blob en el navegador */
const triggerBlobDownload = (blob, filename) => {
  const url = globalThis.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    globalThis.URL.revokeObjectURL(url);
    link.remove();
  }, 100);
};

// ─────────────────────────────────────────────────────────────
// Función mejorada para descargar una pista
// ─────────────────────────────────────────────────────────────
export const downloadTrack = async (trackId, albumId, format = 'mp3') => {
  // Obtener título de la pista como fallback
  let trackTitle = `track-${trackId}`;
  try {
    const album = await fetchAlbumById(albumId);
    const track = album.tracks?.find(t => String(t.id) === String(trackId));
    if (track?.title) {
      trackTitle = sanitizeFilename(track.title);
    }
  } catch (e) {
    console.warn('No se pudo obtener información de la pista, usando ID como nombre:', e);
  }

  // Realizar la petición de descarga
  const response = await axios({
    url: `${ALBUM_BASE_URL}/${albumId}/download?trackId=${trackId}&format=${format}`,
    method: 'GET',
    responseType: 'blob',
    withCredentials: true,
    headers: { 'Accept': '*/*' }
  });

  // Determinar nombre del archivo
  const contentDisposition = response.headers['content-disposition'];
  const filename = extractFilenameFromHeader(contentDisposition, `${trackTitle}.${format}`);

  // Crear blob y disparar descarga
  const blob = new Blob([response.data], { type: getAudioMimeType(format) });
  triggerBlobDownload(blob, filename);

  return true;
};

// ─────────────────────────────────────────────────────────────
// Función mejorada para descargar un álbum
// ─────────────────────────────────────────────────────────────
export const downloadAlbum = async (albumId, format = 'mp3') => {
  // Obtener título del álbum como fallback
  let albumTitle = `album-${albumId}`;
  try {
    const album = await fetchAlbumById(albumId);
    if (album?.title) {
      albumTitle = sanitizeFilename(album.title);
    }
  } catch (e) {
    console.warn('No se pudo obtener información del álbum, usando ID como nombre:', e);
  }

  // Realizar la petición de descarga
  const response = await axios({
    url: `${ALBUM_BASE_URL}/${albumId}/download-album?format=${format}`,
    method: 'GET',
    responseType: 'blob',
    withCredentials: true,
    headers: { 'Accept': '*/*' }
  });

  // Determinar nombre del archivo ZIP
  const contentDisposition = response.headers['content-disposition'];
  const filename = extractFilenameFromHeader(contentDisposition, `${albumTitle}.zip`);

  // Crear blob y disparar descarga
  const blob = new Blob([response.data], { type: 'application/zip' });
  triggerBlobDownload(blob, filename);

  return true;
};

export const createAlbum = async (albumData) => {
  try {
    const response = await axios.post(
      `${ALBUM_BASE_URL}`,
      albumData,
      {
        withCredentials: true,
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000
      }
    );
    return { success: true, ...response.data };
  } catch (error) {
    console.error('Error creating album:', error);
    if (error.response?.data) {
      return { 
        success: false, 
        error: error.response.data.error || 'Error del servidor' 
      };
    }
    return { success: false, error: error.message || 'Error desconocido' };
  }
};