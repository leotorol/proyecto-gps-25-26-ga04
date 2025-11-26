import React, { useContext, useState, useEffect, useRef } from 'react';
import { useParams, useLocation, useNavigate, Link } from 'react-router-dom';
import { statsService } from '../services/statsService.js';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardMedia,
  Grid,
  Typography,
  Avatar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Rating,
  CardActionArea 
} from '@mui/material';
import { Star } from '@mui/icons-material';
import '../styles/album.css';
import { PlayerContext } from '../context/PlayerContext';
import { CartContext } from '../context/CartContext';
import { AuthContext } from '../context/AuthContext';
import defaultImage from '../assets/images/botonPlay.jpg';
import { fetchAlbumById, fetchTracklist, fetchAlbums } from '../services/jamendoService';
import axios from 'axios';

const ProfileImage = 'https://via.placeholder.com/40';

const AlbumPage = () => {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Contexts — defensivo para evitar crash si no están disponibles
  const _playerCtx = useContext(PlayerContext) || {};
  const playTrack = _playerCtx.playTrack || (() => {});
  const _cartCtx = useContext(CartContext) || {};
  const addToCart = _cartCtx.addToCart || (() => {});
  const _authCtx = useContext(AuthContext) || {};
  const user = _authCtx.user || null;

  const [album, setAlbum] = useState(location.state?.album || null);
  const [albumTracks, setAlbumTracks] = useState([]);
  const [activeTrackId, setActiveTrackId] = useState(null);
  const [feedback, setFeedback] = useState(false);

  // Estados para el diálogo de valoración
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRating, setNewRating] = useState(0);
  const [newComment, setNewComment] = useState("");
  const [similarAlbums, setSimilarAlbums] = useState([]);

  // Estado para saber cuanto tiempo lleva el usuario reproduciendo una cancion para discriminar eventos
  const playbackTimerRef = useRef(null);

  const getArtistName = (album) => {
    // Si existe el campo artist como cadena o como objeto con propiedad name, se usa de inmediato
    if (album.artist) {
      if (typeof album.artist === 'string') return album.artist;
      if (typeof album.artist === 'object' && album.artist.name) return album.artist.name;
    }
    return 'Desconocido';
  };

  useEffect(() => {
    // Si no hay álbum o el ID de la URL ha cambiado respecto al estado actual
    if (!album || String(album.id) !== String(id)) {
      const loadAlbum = async () => {
        try {
          const fetchedAlbum = await fetchAlbumById(id);
          setAlbum(fetchedAlbum);
        } catch (error) {
          console.error('Error fetching album:', error);
        }
      };
      loadAlbum();
    }
  }, [album, id]);

  useEffect(() => {
    if (album && album.id) {
      const loadTracks = async () => {
        try {
          const fetchedTracks = await fetchTracklist(album.id);
          setAlbumTracks(fetchedTracks);
        } catch (error) {
          console.error('Error fetching album tracks:', error);
        }
      };
      loadTracks();
    }
  }, [album]);

  // NUEVO USEEFFECT: Cargar sugerencias "Más como este" USANDO EL BACKEND
  // Esto es mucho más eficiente que descargar todos los álbumes y filtrar en el cliente
  useEffect(() => {
    const loadSimilar = async () => {
      if (!album || !album.id) return;

      try {
        // Llamada al endpoint optimizado del backend
        const similar = await statsService.getSimilarRecommendations(album.genre, 10, album.id);
        setSimilarAlbums(similar);
      } catch (error) {
        console.error("Error cargando álbumes similares:", error);
      }
    };

    loadSimilar();
  }, [album]);

  const handleSimilarClick = (simAlbum) => {
    navigate(`/album/${simAlbum.id}`, { state: { album: simAlbum } });
    window.scrollTo(0, 0); // Subir al inicio de la página
  };


  if (!album) {
    return <Typography variant="h5">Cargando álbum...</Typography>;
  }

  const tracks = albumTracks;
  const ratings = album.ratings || [];

  const handleAddToCart = () => {
    addToCart({
      id: album.id,
      name: album.title || album.name,
      price: album.price || 0,
      image: album.coverImage || album.image || '/assets/images/default-cover.jpg',
      type: 'album',
    });
    setFeedback(true);
    setTimeout(() => setFeedback(false), 1000);
  };

  const handleTrackClick = (track) => {
    if (!user) {
      alert("Debe iniciar sesión para reproducir la música");
      navigate("/login");
      return;
    }
    // clear any pending timer for previous track
    if (playbackTimerRef.current) {
     clearTimeout(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    const trackDetail = tracks.find((t) => t.id === track.id);
    if (trackDetail) {
      playTrack({
        ...trackDetail,
        title: trackDetail.title || trackDetail.name,
        coverImage:
          trackDetail.coverImage || album.coverImage || album.image || '/assets/images/default-cover.jpg',
        tracklist: tracks,
        albumId: album.id
      });
      setActiveTrackId(track.id);
      // start 20s timer to count as a play
      playbackTimerRef.current = setTimeout(() => {
        statsService.sendEvent('track.played', {
          entityType: 'track',
          entityId: trackDetail.id || trackDetail._id || track.id,
          userId: user?.id || user?._id || null,
          metadata: {
            albumId: album?.id || album?._id || album?.albumId || null,
            artist: album?.artist || album?.artistId || trackDetail.artist || null
          }
        }).catch(err => console.warn('statsService.sendEvent error', err));
        playbackTimerRef.current = null;
      }, 20000);
    } else {
      console.error("Track not found");
    }
  };

  // cleanup timer on unmount / navigation
  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) {
        clearTimeout(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, []);

  const handleDownload = (track) => {
    const format = window.prompt("Selecciona el formato para descargar (mp3, wav o flac):", "mp3");
    if (!format) return;
    const validFormats = ["mp3", "wav", "flac"];
    if (!validFormats.includes(format.toLowerCase())) {
      alert("Formato no válido. Intente con mp3, wav o flac.");
      return;
    }
    let downloadUrl = "";
    if (track.url.endsWith(".mp3")) {
      downloadUrl = track.url.replace(".mp3", `.${format.toLowerCase()}`);
    } else {
      downloadUrl = track.url;
    }
    window.open(downloadUrl, "_blank");
  };

  const handleBuySong = (track) => {
    addToCart({
      id: track.id,
      name: track.title || track.name,
      price: track.price,
      image: track.coverImage || album.coverImage || album.image || '/assets/images/default-cover.jpg',
      type: 'song',
      formats: ['mp3', 'wav', 'flac'],
    });
  };

  const handleSubmitRating = async () => {
    if (!user) {
      alert("Debes iniciar sesión para añadir una valoración.");
      return;
    }
    const newRatingObj = {
      userId: user.id, 
      rating: newRating,
      comment: newComment,
      profileImage: user.profileImage
    };
    try {
      const response = await axios.post(
        `http://localhost:5001/api/albums/${album.id}/rate`,
        newRatingObj,
        { withCredentials: true }
      );
      if (response.data.success) {
        setAlbum(response.data.album);
      } else {
        alert("Error al guardar la valoración.");
      }
    } catch (error) {
      console.error("Error saving rating:", error);
      alert("Error al guardar la valoración.");
    }
    setNewRating(0);
    setNewComment("");
    setDialogOpen(false);
  };

  const handleOpenRatingDialog = () => {
    if (!user) {
      alert("Debes iniciar sesión para añadir una valoración.");
      navigate("/login");
      return;
    }
    setDialogOpen(true);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        p: 3,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `url(${album.coverImage || album.image || '/assets/images/default-cover.jpg'})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(8px)',
          zIndex: -1,
        }}
      />

      <Box className="album-page" sx={{ maxWidth: 800, width: '100%', p: 3 }}>
        <Card elevation={4} sx={{ borderRadius: '16px', overflow: 'hidden' }}>
          <CardMedia
            component="img"
            image={album.coverImage || album.image || '/assets/images/default-cover.jpg'}
            alt={`${album.title || album.name} cover`}
            sx={{ maxHeight: 450, objectFit: 'cover' }}
          />
          <CardContent sx={{ backgroundColor: '#f7f7f7' }}>
            <Typography variant="h4" gutterBottom sx={{ fontWeight: 'bold' }}>
              {album.title || album.name}
            </Typography>
            <Typography variant="subtitle1" color="black">
              por{' '}
              <Link
                to={`/artistProfile/${album.artistId || album.artist_id}`}
                style={{ textDecoration: 'none', color: '#1DA0C3', fontWeight: 'bold' }}
              >
                {getArtistName(album)}
              </Link>
            </Typography>
            <Grid container>
              <Grid item xs={6}>
                <Typography sx={{ color: "gray", m: 0, display: "flex", alignItems: "center" }}>
                  Lanzado en: {album.releaseYear || album.releasedate}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', width: '100%' }}>
                  <Typography sx={{ mr: '10px' }}>Genres:</Typography>
                  <Typography className="tag">#{album.genre}</Typography>
                </Box>
              </Grid>
            </Grid>
            <Grid container spacing={1} sx={{ mt: 2 }}>
              <Grid item xs={12}>
                <h4 className="precio">${album.price}</h4>
              </Grid>
            </Grid>
            <Box sx={{ my: 2, display: 'flex', justifyContent: 'space-between' }}>
              <Button variant="contained" color="primary" onClick={handleAddToCart}>
                Añadir al carrito
              </Button>
              {feedback && (
                <Typography variant="body2" color="success.main">
                  ¡Añadido al carrito!
                </Typography>
              )}
            </Box>
          </CardContent>
        </Card>

        {/* Lista de canciones */}
        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>
            Lista de canciones:
          </Typography>
          <div className="lista_espaciada">
            <Typography className="ind_cancion" sx={{ width: "5%", m: "0 2% 0 4%" }}>
              #
            </Typography>
            <Typography className="ind_cancion" sx={{ width: "35%", m: "0 2%" }}>
              Nombre
            </Typography>
            <Typography className="ind_cancion" sx={{ width: "30%", m: "0 2%" }}>
              Autores
            </Typography>
            <Typography className="ind_cancion" sx={{ width: "20%", m: "0 2%" }}>
              Reproducciones
            </Typography>
            <Typography className="ind_cancion" sx={{ width: "10%", m: "0 2%" }}>
              Comprar
            </Typography>
          </div>
          <Grid container spacing={0}>
            {tracks.map((track, index) => (
              <Grid item xs={12} key={track.id || index}>
                <Box className="track-item" sx={{ p: 1, borderRadius: '8px', boxShadow: 3, backgroundColor: '#fff' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                    <Typography sx={{ fontSize: "1.1rem", color: "black", m: "0 20px 0 0", width: "5%" }}>
                      {track.position || index + 1}
                    </Typography>
                    <img
                      src={defaultImage}
                      alt="Play Button"
                      onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(0.7)")}
                      onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
                      onClick={() => handleTrackClick(track)}
                      style={{
                        margin: "0 5px",
                        width: "30px",
                        height: "30px",
                        cursor: "pointer",
                        transition: "filter 0.3s ease-in-out",
                      }}
                    />
                    <Box sx={{ ml: 1, mt: 0, width: '200px', height: '40px', flex: "35%" }}>
                      <Typography sx={{ fontSize: "1rem", color: "black", m: 0 }}>
                        {track.title || track.name}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: "0.8rem", color: "gray", m: 0, flex: "30%" }}>
                      {track.autor || track.artistName}
                    </Typography>
                    <Typography sx={{ fontSize: "0.8rem", color: "gray", m: 0, ml: "auto", flex: "20%" }}>
                      {track.n_reproducciones}
                    </Typography>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => handleBuySong(track)}
                      sx={{ ml: 2, flex: "10%" }}
                    >
                      Comprar {track.price}
                    </Button>
                  </Box>
                </Box>
              </Grid>
            ))}
          </Grid>
        </Box>

        {/* Valoraciones */}
        <Box sx={{ mt: 4, position: 'relative' }}>
          <Typography variant="h5" gutterBottom>
            Valoraciones:
          </Typography>
          <Button 
            variant="contained" 
            size="small" 
            onClick={handleOpenRatingDialog}
            sx={{
              position: 'absolute',
              top: 0,
              right: 0,
              mt: '4px'
            }}
          >
            Añadir valoración
          </Button>
          <Box component="ul" sx={{ pl: 2 }}>
            {ratings.map((rating, index) => (
              <li key={index} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                <Avatar
                  src={rating.profileImage ? rating.profileImage : ProfileImage}
                  alt="Perfil Usuario"
                  sx={{ width: 40, height: 40, mr: 2 }}
                />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                    {rating.comment}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {[...Array(5)].map((_, starIndex) => (
                      <Star
                        key={starIndex}
                        sx={{
                          color: starIndex < rating.rating ? 'gold' : 'gray',
                          fontSize: 18,
                        }}
                      />
                    ))}
                  </Box>
                </Box>
              </li>
            ))}
          </Box>
        </Box>

        {/* NUEVA SECCIÓN: MÁS COMO ESTE */}
        {similarAlbums.length > 0 && (
          <Box sx={{ mt: 6, mb: 4 }}>
            <Typography variant="h5" sx={{ mb: 2, fontWeight: 'bold', color: '#333', borderBottom: '1px solid #ccc', pb: 1 }}>
              Más como este (Género: {album.genre})
            </Typography>
            
            <Grid container spacing={3}>
              {similarAlbums.map((simAlbum) => (
                <Grid item xs={6} sm={3} key={simAlbum.id}>
                  <Card 
                    sx={{ 
                      height: '100%', 
                      display: 'flex', 
                      flexDirection: 'column',
                      transition: 'transform 0.2s',
                      '&:hover': { transform: 'scale(1.03)' }
                    }}
                    onClick={() => handleSimilarClick(simAlbum)}
                  >
                    <CardActionArea>
                      <CardMedia
                        component="img"
                        image={simAlbum.coverImage || '/assets/images/default-cover.jpg'}
                        alt={simAlbum.title}
                        sx={{ aspectRatio: '1/1' }}
                      />
                      <CardContent>
                        <Typography gutterBottom variant="subtitle1" component="div" noWrap>
                          {simAlbum.title}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {simAlbum.artist?.name || simAlbum.artist || 'Artista desconocido'}
                        </Typography>
                      </CardContent>
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}

      </Box>
  
      {/* Diálogo para añadir valoración */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>Añadir valoración</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ mr: 2 }}>Puntuación:</Typography>
            <Rating 
              name="new-rating" 
              value={newRating} 
              onChange={(_, newValue) => setNewRating(newValue)}
              precision={1}
            />
          </Box>
          <TextField
            autoFocus
            margin="dense"
            label="Comentario"
            type="text"
            fullWidth
            variant="outlined"
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDialogOpen(false); setNewRating(0); setNewComment(""); }}>
            Cancelar
          </Button>
          <Button onClick={handleSubmitRating}>
            Enviar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AlbumPage;