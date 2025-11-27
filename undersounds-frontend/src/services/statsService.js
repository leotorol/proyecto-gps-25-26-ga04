import axios from 'axios';

const STATS_API = import.meta.env.VITE_STATS_API_URL;

/**
 * Envía un evento de interacción (play, like, view, etc.)
 */
const sendEvent = async (eventType, payload = {}) => {
  const body = {
    eventType,
    timestamp: new Date().toISOString(),
    ...payload
  };
    if (body.entityId !== undefined && body.entityId !== null) {
    body.entityId = String(body.entityId);
  }

  try {
    // withCredentials: true es importante si usas cookies/sesiones cruzadas
    const res = await axios.post(`${STATS_API}/stats/events`, body, { withCredentials: true });
    return res.data;
  } catch (err) {
    // No bloqueamos la UI si falla una estadística
    console.warn('statsService.sendEvent error', err?.response?.data || err.message);
    return null;
  }
};

/**
 * Obtiene KPIs resumidos para un artista (plays, likes, revenue, etc.)
 * @param {string} artistId 
 * @param {string} [startDate] - Formato YYYY-MM-DD
 * @param {string} [endDate] - Formato YYYY-MM-DD
 */
const getArtistKpis = async (artistId, startDate = null, endDate = null) => {
  try {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const res = await axios.get(`${STATS_API}/stats/artist/${artistId}/kpis`, { params });
    return res.data;
  } catch (error) {
    console.error('Error fetching artist KPIs:', error);
    throw error;
  }
};

/**
 * Obtiene tendencias
 * @param {'tracks'|'artists'|'albums'} type 
 * @param {number} limit 
 * @param {'day'|'week'|'month'} period 
 */
const getTrending = async (type, limit = 10, period = 'week') => {
  try {
    // Mapeamos 'type' a 'genre' que es lo que espera el backend actualmente
    const params = { genre: type, period, limit };
    
    const res = await axios.get(`${STATS_API}/stats/trending`, { params });
    // FIX: Devolver directamente el array 'trends' para que el .map() del frontend funcione
    // Si el backend devuelve una lista directa (como haremos ahora), devolvemos res.data
    return Array.isArray(res.data) ? res.data : (res.data.trends || []);
  } catch (error) {
    console.error('Error fetching trending:', error);
    // FIX: Devolver un array vacío en lugar de un objeto en caso de error
    return [];
  }
};

/**
 * Obtiene recomendaciones personalizadas para un usuario
 * @param {string} userId 
 * @param {number} limit 
 */
const getUserRecommendations = async (userId, limit = 20) => {
  try {
    const res = await axios.get(`${STATS_API}/recommendations/user/${userId}`, {
      params: { limit }
    });
    return res.data;
  } catch (error) {
    console.error('Error fetching user recommendations:', error);
    return [];
  }
};

/**
 * Obtiene recomendaciones similares a un album
 * @param {'track'|'album'|'artist'} type 
 * @param {string} id 
 */
const getSimilarRecommendations = async (genre, limit = 10, excludeId = null) => {
  try {
    const params = { genre, limit };
    if (excludeId) params.excludeId = excludeId;
    const res = await axios.get(`${STATS_API}/recommendations/similar`, { params });
    return res.data;
  } catch (error) {
    console.error('Error fetching similar recommendations:', error);
    return [];
  }
};

export const statsService = { sendEvent,getArtistKpis,getTrending,getUserRecommendations,getSimilarRecommendations };