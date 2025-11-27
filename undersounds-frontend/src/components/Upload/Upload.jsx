import React, { useState, useContext, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Dialog, DialogTitle, DialogContent, TextField, DialogActions,
  Button, Box, MenuItem, Select,
  InputLabel, FormControl, Typography
} from '@mui/material';
import Grid2 from '@mui/material/Grid2';
import { createAlbum, fetchArtistsList } from '../../services/jamendoService';
import { AuthContext } from '../../context/AuthContext';

const UploadAlbumForm = ({ open, onClose }) => {
  const { user } = useContext(AuthContext);

  const [albumName, setAlbumName] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [coverImage, setCoverImage] = useState(null);
  const [releaseYear, setReleaseYear] = useState(new Date().getFullYear());
  const [tracks, setTracks] = useState([]);
  const [price, setPrice] = useState(9.99);
  const label = '';

  const [artistsList, setArtistsList] = useState([]);
  const [selectedArtist, setSelectedArtist] = useState('');

  const [artistId, setArtistId] = useState(user.artistId || '');
  const artistName = user.bandName || user.username || 'Unknown Artist';

  const showArtistIdWarning = user.role === 'band' && !user.artistId;

  // Contador para IDs únicos de pistas
  const trackIdCounter = useRef(0);

  useEffect(() => {
    if (user.role === 'label') {
      fetchArtistsList()
        .then(data => {
          setArtistsList(data || []);
          console.log("Artistas:", data);
        })
        .catch((error) => console.error('Error fetching artists:', error));
    }
  }, [user.role]);

  const getAudioDuration = (file) => {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = new Audio();
      audio.src = url;

      audio.addEventListener('loadedmetadata', () => {
        URL.revokeObjectURL(url);
        const minutes = Math.floor(audio.duration / 60);
        const seconds = Math.floor(audio.duration % 60);
        const formattedDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        resolve(formattedDuration);
      });

      audio.addEventListener('error', () => {
        console.error('Error al leer la duración del archivo de audio');
        URL.revokeObjectURL(url);
        resolve('0:00');
      });
    });
  };

  const addTrack = () => {
    trackIdCounter.current += 1;
    setTracks([...tracks, {
      _uid: `track-${trackIdCounter.current}`,
      title: '',
      file: null,
      duration: '0:00',
      autor: artistName
    }]);
  };

  const updateTrack = (uid, field, value) => {
    const newTracks = tracks.map(t => t._uid === uid ? { ...t, [field]: value } : t);
    setTracks(newTracks);
  };

  const handleSubmit = async () => {
    if (!albumName || !genre || !coverImage || tracks.length === 0) {
      alert("Por favor, completa todos los campos obligatorios (título, género, portada y al menos una pista)");
      return;
    }

    if (user.role === 'band' && !artistId) {
      alert("Error: No se puede subir un álbum sin una cuenta de artista vinculada. Contacta al administrador.");
      return;
    }

    if (user.role === 'label' && !selectedArtist) {
      alert("Por favor, selecciona el artista representante para el álbum.");
      return;
    }

    const formData = new FormData();
    formData.append('title', albumName);
    formData.append('artistId', user.role === 'label' ? selectedArtist : artistId);
    formData.append('description', description);
    formData.append('releaseYear', releaseYear);
    formData.append('genre', genre);
    formData.append('price', price);
    formData.append('label', label);
    formData.append('coverImage', coverImage);

    let index = 0;
    for (const track of tracks) {
      formData.append(`trackTitles[${index}]`, track.title);
      formData.append(`trackDurations[${index}]`, track.duration);
      formData.append(`trackAutors[${index}]`, track.autor);
      if (track.file) {
        formData.append('tracks', track.file);
      }
      index += 1;
    }

    try {
      const response = await createAlbum(formData);
      if (response.success) {
        alert("Álbum creado correctamente");
        onClose();
      } else {
        alert("Error al crear el álbum: " + (response.error || "Hubo un problema"));
      }
    } catch (error) {
      console.error("Error en la subida:", error);
      alert("Error al crear el álbum: " + (error.message || "Hubo un problema de comunicación"));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Subir Nuevo Álbum</DialogTitle>
      <DialogContent>
        {showArtistIdWarning && (
          <Box sx={{
            backgroundColor: '#fff3cd',
            color: '#856404',
            padding: 2,
            borderRadius: 1,
            marginBottom: 2
          }}>
            <Typography variant="body2">
              <strong>Atención:</strong> Tu cuenta de artista no está correctamente configurada.
              Por favor, contacta al administrador para vincular tu perfil de artista.
            </Typography>
          </Box>
        )}

        <Grid2 container spacing={2}>
          <Grid2 size={{ xs: 12, md: 6 }}>
            <TextField
              autoFocus
              margin="dense"
              label="Título del Álbum *"
              type="text"
              fullWidth
              variant="outlined"
              value={albumName}
              onChange={(e) => setAlbumName(e.target.value)}
              required
            />

            <TextField
              margin="dense"
              label="Descripción"
              type="text"
              fullWidth
              variant="outlined"
              multiline
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <TextField
              margin="dense"
              label="Género Musical *"
              type="text"
              fullWidth
              variant="outlined"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              required
            />

            <Box mt={2} mb={2} sx={{ display: 'flex', alignItems: 'center' }}>
              <Button
                variant="contained"
                component="label"
                color={coverImage ? "success" : "primary"}
              >
                {coverImage ? "Portada Seleccionada ✓" : "Seleccionar Portada *"}
                <input
                  type="file"
                  hidden
                  accept="image/*"
                  onChange={(e) => {
                    if (e.target.files.length > 0) {
                      setCoverImage(e.target.files[0]);
                    }
                  }}
                />
              </Button>
              {coverImage && (
                <Typography variant="body2" sx={{ ml: 2 }}>
                  {coverImage.name}
                </Typography>
              )}
            </Box>
          </Grid2>

          <Grid2 size={{ xs: 12, md: 6 }}>
            <TextField
              margin="dense"
              label="Año de Lanzamiento *"
              type="number"
              fullWidth
              variant="outlined"
              value={releaseYear}
              onChange={(e) => setReleaseYear(Number.parseInt(e.target.value, 10) || new Date().getFullYear())}
              slotProps={{ htmlInput: { min: 1900, max: new Date().getFullYear() + 5 } }}
              required
            />

            <TextField
              margin="dense"
              label="Precio (€) *"
              type="number"
              fullWidth
              variant="outlined"
              value={price}
              onChange={(e) => setPrice(Number.parseFloat(e.target.value) || 0)}
              slotProps={{ htmlInput: { step: 0.01, min: 0 } }}
              required
            />
            {user.role === 'label' && (
              <FormControl fullWidth margin="dense" required>
                <InputLabel id="select-artist-label">Artista Representante</InputLabel>
                <Select
                  labelId="select-artist-label"
                  value={selectedArtist || ""}
                  label="Artista Representante"
                  onChange={(e) => {
                    setSelectedArtist(e.target.value);
                    setArtistId(e.target.value);
                    console.log("artistId", artistId);
                    console.log("selectedArtist", e.target.value);
                  }}
                >
                  {artistsList.map((artist) => (
                    <MenuItem key={artist._id} value={artist._id}>
                      {artist.name || 'Sin Nombre'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </Grid2>
        </Grid2>

        <Box mt={3}>
          <Typography variant="h6">Pistas del Álbum *</Typography>
          {tracks.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
              Añade al menos una pista a tu álbum
            </Typography>
          )}

          {tracks.map((track, idx) => (
            <Box key={track._uid} mb={2} p={2} sx={{ backgroundColor: '#f5f5f5', borderRadius: 1 }}>
              <Grid2 container spacing={2}>
                <Grid2 size={{ xs: 12, sm: 6 }}>
                  <TextField
                    label={`Título de la pista ${idx + 1} *`}
                    type="text"
                    fullWidth
                    variant="outlined"
                    value={track.title}
                    onChange={(e) => updateTrack(track._uid, 'title', e.target.value)}
                    required
                  />
                </Grid2>
                <Grid2 size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="Duración"
                    type="text"
                    fullWidth
                    variant="outlined"
                    value={track.duration}
                    onChange={(e) => updateTrack(track._uid, 'duration', e.target.value)}
                    placeholder="mm:ss"
                  />
                </Grid2>
                <Grid2 size={{ xs: 6, sm: 3 }}>
                  <TextField
                    label="Autor"
                    type="text"
                    fullWidth
                    variant="outlined"
                    value={track.autor}
                    onChange={(e) => updateTrack(track._uid, 'autor', e.target.value)}
                  />
                </Grid2>
                <Grid2 size={12}>
                  <Button
                    variant="contained"
                    component="label"
                    color={track.file ? "success" : "primary"}
                    fullWidth
                  >
                    {track.file ? 'Archivo Seleccionado ✓' : 'Seleccionar Archivo de Audio *'}
                    <input
                      type="file"
                      hidden
                      accept="audio/*"
                      onChange={async (e) => {
                        if (e.target.files.length > 0) {
                          const audioFile = e.target.files[0];
                          updateTrack(track._uid, 'file', audioFile);
                          try {
                            const duration = await getAudioDuration(audioFile);
                            updateTrack(track._uid, 'duration', duration);
                          } catch (error) {
                            console.error('Error al obtener la duración:', error);
                          }
                        }
                      }}
                    />
                  </Button>
                  {track.file && (
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {track.file.name}
                    </Typography>
                  )}
                </Grid2>
              </Grid2>
            </Box>
          ))}

          <Button
            variant="outlined"
            onClick={addTrack}
            startIcon={<span>+</span>}
            sx={{ mt: 1 }}
          >
            Añadir Pista
          </Button>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">Cancelar</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="primary"
          disabled={!albumName || !genre || !coverImage || tracks.length === 0 || !artistId}
        >
          Publicar Álbum
        </Button>
      </DialogActions>
    </Dialog>
  );
};

UploadAlbumForm.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default UploadAlbumForm;