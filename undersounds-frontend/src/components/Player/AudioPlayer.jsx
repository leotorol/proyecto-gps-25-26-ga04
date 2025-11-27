import React, { useEffect, useRef, useContext, useState } from 'react';
import { Box, Slider, IconButton, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import SkipNextIcon from '@mui/icons-material/SkipNext';
import SkipPreviousIcon from '@mui/icons-material/SkipPrevious';
import VolumeUpIcon from '@mui/icons-material/VolumeUp';
import CancelIcon from '@mui/icons-material/Cancel';
import FavoriteBorderIcon from '@mui/icons-material/FavoriteBorder';
import FavoriteIcon from '@mui/icons-material/Favorite';
import { PlayerContext } from '../../context/PlayerContext';
import { AuthContext } from '../../context/AuthContext';
import { statsService } from '../../services/statsService';
import { toggleLikeTrack } from '../../services/authService';

const AudioPlayer = () => {
  const { currentTrack, isPlaying, playTrack, pauseTrack, stopTrack, volume, changeVolume } = useContext(PlayerContext);
  const { user, setUser } = useContext(AuthContext);
  const navigate = useNavigate();

  const [progress, setProgress] = useState(0);
  const [isVisible, setIsVisible] = useState(true); 
  const [liked, setLiked] = useState(false); 

  const audioRef = useRef(new Audio());
  const location = useLocation();

  // --- HELPER PARA GENERAR ID ÚNICO ---
  const getUniqueTrackId = (track) => {
    if (!track) return null;
    const id = track.id || track._id;
    
    // Si es un ObjectId de Mongo (string largo), es seguro usarlo tal cual
    if (typeof id === 'string' && id.length > 10) return id;
    
    // 1. Intentar obtener albumId del objeto track
    let albumId = track.albumId;

    // 2. Si no existe, intentar obtenerlo de la URL actual (si estamos en vista de álbum)
    // Esto soluciona el error cuando el track no trae el albumId explícito
    if (!albumId && location.pathname.startsWith('/album/')) {
      const parts = location.pathname.split('/');
      // ruta: /album/:id -> ["", "album", "id"]
      if (parts.length > 2) {
        albumId = parts[2];
      }
    }

    // Si tenemos albumId, creamos un ID compuesto
    if (albumId) {
      return `${albumId}_${id}`;
    }
    
    // Fallback
    return String(id);
  };

  // Detener la reproducción y limpiar el track si no estamos en la ruta /album
  useEffect(() => {
    if (!location.pathname.startsWith('/album')) {
      stopTrack();
      audioRef.current.pause();
      setProgress(0);
    }
  }, [location.pathname, stopTrack]);

  // Actualizar la fuente del audio al cambiar la pista
  useEffect(() => {
    if (currentTrack?.url) {
      audioRef.current.src = currentTrack.url;
      setProgress(0);
    }
  }, [currentTrack]);

  // Restaurar la visibilidad del reproductor cuando se cambie la pista
  useEffect(() => {
    if (currentTrack) {
      setIsVisible(true);
    }
  }, [currentTrack]);

  // Actualizar el volumen sin reiniciar la reproducción
  useEffect(() => {
    audioRef.current.volume = volume;
  }, [volume]);

  // Reproducir o pausar según isPlaying
  useEffect(() => {
    if (currentTrack) {
      if (isPlaying) {
        audioRef.current.play().catch(err => console.error(err));
      } else {
        audioRef.current.pause();
      }
    }
  }, [isPlaying, currentTrack]);

  // Actualizar el progreso del audio cada 500ms
  useEffect(() => {
    const interval = setInterval(() => {
      if (audioRef.current && isPlaying) {
        setProgress(audioRef.current.currentTime);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // --- LÓGICA DE LIKES ---
  useEffect(() => {
    const uniqueId = getUniqueTrackId(currentTrack);
    if (!uniqueId || !user) { 
      setLiked(false); 
      return; 
    }
    // Comprobamos si el ID único está en la lista del usuario
    const isLiked = user.likedTracks?.includes(uniqueId);
    setLiked(!!isLiked);
  }, [currentTrack, user, location.pathname]); // Añadido location.pathname para recalcular si cambia la URL

  const toggleLike = async () => {
    if (!currentTrack) return;
    if (!user) {
      navigate('/login');
      return;
    }

    const uniqueId = getUniqueTrackId(currentTrack);
    const prevLiked = liked;
    setLiked(!prevLiked); // UI Optimista local

    try {
      // 1. Persistir en BD
      await toggleLikeTrack(uniqueId);

      // 2. Actualizar contexto globalmente para persistencia en sesión
      if (setUser) {
        setUser(prevUser => {
          const currentLikes = prevUser.likedTracks || [];
          let newLikes;
          
          if (prevLiked) {
            // Quitar like
            newLikes = currentLikes.filter(id => id !== uniqueId);
          } else {
            // Añadir like
            newLikes = currentLikes.includes(uniqueId) ? currentLikes : [...currentLikes, uniqueId];
          }
          return { ...prevUser, likedTracks: newLikes };
        });
      }

      // 3. Enviar evento Stats (solo si es like)
      if (!prevLiked) {
        await statsService.sendEvent('track.liked', {
          entityType: 'track',
          entityId: uniqueId,
          userId: user.id || user._id,
          metadata: { 
            artist: currentTrack.artist || null,
            albumId: currentTrack.albumId || null
          }
        });
      } 
    } catch (err) {
      console.warn('Error al dar like', err);
      setLiked(prevLiked); // Revertir en caso de error
    }
  };

  const handleSliderChange = (e, newValue) => {
    audioRef.current.currentTime = newValue;
    setProgress(newValue);
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      pauseTrack();
    } else {
      playTrack(currentTrack);
    }
  };

  // Usamos la lista de pistas enviada en currentTrack.tracklist, si existe
  const trackList = currentTrack?.tracklist || [];
  
  const handleSkipNext = () => {
    if (!currentTrack) return;
    const currentIndex = trackList.findIndex(t => t.id === currentTrack.id);
    if (currentIndex !== -1 && currentIndex < trackList.length - 1) {
      const nextTrack = trackList[currentIndex + 1];
      playTrack({
        ...nextTrack,
        title: nextTrack.title || nextTrack.name,
        coverImage: nextTrack.coverImage || currentTrack.coverImage || '/assets/images/default-cover.jpg',
        tracklist: trackList,
        albumId: currentTrack.albumId // Intentar preservar albumId si existe
      });
    } else {
      audioRef.current.currentTime = 0;
      setProgress(0);
    }
  };
  
  const handleSkipPrevious = () => {
    if (!currentTrack) return;
    const currentIndex = trackList.findIndex(t => t.id === currentTrack.id);
    if (currentIndex > 0) {
      const prevTrack = trackList[currentIndex - 1];
      playTrack({
        ...prevTrack,
        title: prevTrack.title || prevTrack.name,
        coverImage: prevTrack.coverImage || currentTrack.coverImage || '/assets/images/default-cover.jpg',
        tracklist: trackList,
        albumId: currentTrack.albumId // Intentar preservar albumId si existe
      });
    } else {
      audioRef.current.currentTime = 0;
      setProgress(0);
    }
  };

  const handleCancel = () => {
    pauseTrack();
    setIsVisible(false);
  };

  // Mostrar el reproductor solo si estamos en la ruta /album, hay una pista y es visible
  const inReproduction = location.pathname.startsWith('/album');
  const shouldShow = inReproduction && currentTrack && isVisible;

  return (
    <Box
      sx={{
        display: shouldShow ? 'flex' : 'none',
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '90px',
        backgroundColor: '#282828',
        color: 'white',
        alignItems: 'center',
        padding: '0 20px',
        zIndex: 1000,
      }}
    >
      {/* Izquierda: Información de la pista (imagen, título y artista) */}
      <Box sx={{ display: 'flex', alignItems: 'center', width: '30%' }}>
        <img
          src={currentTrack?.coverImage || '/assets/images/default-cover.jpg'}
          alt={currentTrack?.title}
          style={{ height: '60px', width: '60px', marginRight: '15px' }}
        />
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
            {currentTrack?.title}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="caption" sx={{ marginRight: 1 }}>
              {currentTrack?.artist}
            </Typography>
            {/* Botón de Like */}
            <IconButton 
              size="small" 
              onClick={toggleLike}
              sx={{ 
                color: liked ? '#1DA0C3' : '#b3b3b3', // Color activo (Cyan) vs inactivo (Gris claro)
                '&:hover': { color: liked ? '#1DA0C3' : 'white' },
                padding: '4px'
              }}
            >
              {liked ? <FavoriteIcon fontSize="small" /> : <FavoriteBorderIcon fontSize="small" />}
            </IconButton>
          </Box>
        </Box>
      </Box>

      {/* Centro: Controles y slider de progreso */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '40%' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton sx={{ color: 'white' }} onClick={handleSkipPrevious}>
            <SkipPreviousIcon />
          </IconButton>
          <IconButton sx={{ color: 'white' }} onClick={handlePlayPause}>
            {isPlaying ? <PauseIcon fontSize="large" /> : <PlayArrowIcon fontSize="large" />}
          </IconButton>
          <IconButton sx={{ color: 'white' }} onClick={handleSkipNext}>
            <SkipNextIcon />
          </IconButton>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
          <Typography variant="caption">{formatTime(progress)}</Typography>
          <Slider
            min={0}
            max={audioRef.current.duration || 0}
            value={progress}
            onChange={handleSliderChange}
            sx={{ 
              color: 'white', 
              mx: 2,
              '& .MuiSlider-thumb': { display: 'none' },
              '&:hover .MuiSlider-thumb': { display: 'block' }
            }}
          />
          <Typography variant="caption">{formatTime(audioRef.current.duration || 0)}</Typography>
        </Box>
      </Box>

      {/* Derecha: Control de volumen y botón de cancelar */}
      <Box sx={{ display: 'flex', alignItems: 'center', width: '30%', justifyContent: 'flex-end' }}>
        <VolumeUpIcon />
        <Slider
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e, newValue) => changeVolume(newValue)}
          sx={{ width: '80px', color: 'white', ml: 1, mr: 2 }}
        />
        <IconButton sx={{ color: 'white' }} onClick={handleCancel}>
          <CancelIcon />
        </IconButton>
      </Box>
    </Box>
  );
};

export default AudioPlayer;