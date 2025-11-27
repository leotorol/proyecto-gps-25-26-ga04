import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { authService } from '../services/authService';
import axios from 'axios';

export const AuthContext = createContext({
  user: null,
  setUser: () => {},
  loading: true,
  login: async () => {},
  logout: async () => {},
  register: async () => {}
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUserWithToken = useCallback(async (token) => {
    if (!token) return null;
    try {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const response = await axios.get('http://localhost:5000/api/auth/me');
      if (response?.data?.account) {
        return response.data.account;
      }
      return null;
    } catch (error) {
      console.error('Error al obtener datos del usuario con token:', error);
      return null;
    }
  }, []);

  useEffect(() => {
    const refreshSession = async () => {
      try {
        console.log('Intentando refrescar la sesión...');

        const token = localStorage.getItem('token');
        if (token) {
          const userData = await fetchUserWithToken(token);
          if (userData) {
            setUser(userData);
            setLoading(false);
            return;
          } else {
            localStorage.removeItem('token');
            delete axios.defaults.headers.common['Authorization'];
          }
        }

        try {
          const { account } = await authService.refreshToken();
          if (account) {
            setUser(account);
            console.log('Sesión refrescada exitosamente:', account);
          } else {
            console.log('La respuesta de refreshToken no devolvió account.');
          }
        } catch (refreshError) {
          console.error('Error en refreshToken:', refreshError);
        }
      } catch (error) {
        console.error('No se pudo refrescar la sesión:', error);
      } finally {
        setLoading(false);
      }
    };

    refreshSession();
  }, [fetchUserWithToken]);

  const login = useCallback(
    async (emailOrUserData, passwordOrToken, remember) => {
      try {
        if (typeof emailOrUserData === 'object' && passwordOrToken) {
          localStorage.setItem('token', passwordOrToken);

          if (!emailOrUserData.username || !emailOrUserData.email) {
            const fullUserData = await fetchUserWithToken(passwordOrToken);
            if (fullUserData) {
              setUser(fullUserData);
            } else {
              setUser(emailOrUserData);
            }
          } else {
            setUser(emailOrUserData);
          }

          axios.defaults.headers.common['Authorization'] = `Bearer ${passwordOrToken}`;
          return;
        }

        const { account, accessToken } = await authService.login(emailOrUserData, passwordOrToken, remember);
        console.log('Login normal exitoso:', account);
        setUser(account);

        if (accessToken) {
          localStorage.setItem('token', accessToken);
          axios.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
        }
      } catch (error) {
        console.error('Error during login:', error);
        throw error;
      }
    },
    [fetchUserWithToken]
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
      localStorage.removeItem('token');
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
    } catch (error) {
      console.error('Error during logout:', error);
      throw error;
    }
  }, []);

  const register = useCallback(async (formData) => {
    try {
      const response = await authService.register(formData);
      if (response?.account) {
        setUser(response.account);
        if (response.accessToken) {
          localStorage.setItem('token', response.accessToken);
          axios.defaults.headers.common['Authorization'] = `Bearer ${response.accessToken}`;
        }
      }
      return response;
    } catch (error) {
      console.error('Error during registration:', error);
      throw error;
    }
  }, []);

  const value = useMemo(() => ({ user, setUser, loading, login, logout, register }), [
    user,
    loading,
    login,
    logout,
    register
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired
};