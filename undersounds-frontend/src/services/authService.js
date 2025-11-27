import axios from 'axios';

const API_URL = 'http://localhost:5000/api/auth';

// Habilitar el envío de cookies en cada petición
axios.defaults.withCredentials = true;

// Variable para almacenar el access token en memoria
let accessToken = null;

// Interceptor para agregar el header de autorización si el access token existe
axios.interceptors.request.use(
  (config) => {
    if (accessToken) {
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => { throw error; }
);

// Interceptor para refrescar el access token usando la cookie del refresh token
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (
      originalRequest?.url?.includes('/refresh-token') ||
      originalRequest?.url?.includes('/login') ||
      originalRequest?.url?.includes('/register')
    ) {
      throw error;
    }
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const { data } = await axios.post(`${API_URL}/refresh-token`);
        accessToken = data.accessToken;
        axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
        return axios(originalRequest);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        throw refreshError;
      }
    }
    throw error;
  }
);

// Funciones de autenticación
export const login = async (email, password, remember) => {
  const response  = await axios.post(
    `${API_URL}/login`,
    { email, password, remember }
  );
  const { accessToken: at } = response.data;
  accessToken = at;
  return response.data;
};

export const register = async (formData) => {
  const response = await axios.post(`${API_URL}/register`, formData);
  return response.data;
};

export const logout = async () => {
  accessToken = null;
  const response = await axios.post(`${API_URL}/logout`);
  return response.data;
};

export const updateUserProfile = async (updatedUser) => {
  try {
    // Usar updatedUser._id y concatenar con una barra '/' entre API_URL y el _id
    const response = await axios.put(`${API_URL}/${updatedUser.id}`, updatedUser);
    return response.data;
  } catch (error) {
    console.error("Error in updateUserProfile:", error.response?.data || error);
    return { success: false };
  }
};

export const refreshToken = async () => {
  const response = await axios.post(`${API_URL}/refresh-token`);
  accessToken = response.data.accessToken;
  return response.data; // se espera { account, accessToken }
};

export const oauthLogin = () => {
  globalThis.location.href = `${API_URL}/google`;
};

export const forgotPassword = async (email) => {
  const response = await axios.post(`${API_URL}/forgot-password`, { email });
  return response.data;
};

export const resetPassword = async (email, otp, newPassword, otpToken) => {
  const response = await axios.post(`${API_URL}/reset-password`, { email, otp, newPassword, otpToken });
  return response.data;
};

export const toggleFollowArtist = async (artistId) => {
  const response = await axios.post(`${API_URL}/toggle-follow`, { artistId });
  return response.data;
};

export const toggleLikeTrack = async (trackId) => {
  const response = await axios.post(`${API_URL}/toggle-like`, { trackId });
  return response.data;
};

export const authService = { login, register, logout, updateUserProfile, refreshToken, oauthLogin, forgotPassword, resetPassword, toggleFollowArtist, toggleLikeTrack };