import React, { useState, useEffect } from 'react';
import { Box, Typography, Tabs, Tab, Card, CardMedia, Grid2, IconButton, Avatar } from '@mui/material';
import AlbumIcon from '@mui/icons-material/Album';
import PersonIcon from '@mui/icons-material/Person';
import { useNavigate } from 'react-router-dom';
import { statsService } from '../../services/statsService';
import { fetchAlbumById } from '../../services/jamendoService';

const TrendingSection = () => {
  const [tabValue, setTabValue] = useState(0);
  const [trendingTracks, setTrendingTracks] = useState([]);
  const [trendingArtists, setTrendingArtists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [navLoading, setNavLoading] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [tracks, artists] = await Promise.all([
          statsService.getTrending('tracks', 6),
          statsService.getTrending('artists', 6)
        ]);
        setTrendingTracks(tracks || []);
        setTrendingArtists(artists || []);
      } catch (error) {
        console.error("Error cargando tendencias", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const goToAlbum = async (albumId) => {
    if (!albumId) return;
    setNavLoading(true);
    try {
      const album = await fetchAlbumById(albumId);
      navigate(`/album/${albumId}`, { state: { album } });
    } catch (err) {
      console.error('Error cargando album antes de navegar:', err);
      navigate(`/album/${albumId}`);
    } finally {
      setNavLoading(false);
    }
  };

  const trackKey = (track) => track?.id || track?.trackId || `${track?.albumId || 'noalbum'}:${track?.title || ''}`;
  const artistKey = (artist) => artist?.entityId || artist?.id || artist?.name || Math.random().toString(36).slice(2, 9);

  return (
    <Box sx={{ width: '100%', my: 4, px: 2 }}>
      <Typography variant="h4" sx={{ mb: 3, fontWeight: 'bold', color: '#1DA0C3' }}>
        Tendencias de la Comunidad
      </Typography>

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} textColor="primary" indicatorColor="primary">
          <Tab label="Top Canciones" />
          <Tab label="Artistas Populares" />
        </Tabs>
      </Box>

      {loading ? (
        <Typography>Cargando tendencias...</Typography>
      ) : (
        <Grid2 container spacing={3}>
          {tabValue === 0 && trendingTracks.map((track, index) => (
            <Grid2 xs={12} md={6} key={trackKey(track)}>
              <Card
                sx={{ display: 'flex', alignItems: 'center', p: 1, cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => {
                  if (navLoading) return;
                  if (track.albumId) {
                    goToAlbum(track.albumId);
                  } else {
                    console.warn("Track sin albumId:", track);
                  }
                }}
              >
                <CardMedia
                  component="img"
                  sx={{ width: 80, height: 80, borderRadius: 1, flexShrink: 0 }}
                  image={track.coverImage || '/assets/images/default-cover.jpg'}
                  alt={track.title}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, ml: 2, minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight="bold" sx={{ lineHeight: 1.2, mb: 0.5 }}>
                    {index + 1}. {track.title || track.name || "Canción desconocida"}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                    {track.artistName || track.artist || "Artista"}
                  </Typography>
                  <Typography variant="caption" color="primary">
                    {track.count || 0} reproducciones
                  </Typography>
                </Box>
                <IconButton color="primary" disabled={navLoading}>
                  <AlbumIcon />
                </IconButton>
              </Card>
            </Grid2>
          ))}

          {tabValue === 1 && trendingArtists.map((artist, index) => (
            <Grid2 xs={12} md={6} key={artistKey(artist)}>
              <Card
                sx={{ display: 'flex', alignItems: 'center', p: 1, cursor: 'pointer', '&:hover': { boxShadow: 6 } }}
                onClick={() => navigate(`/artistProfile/${artist.entityId || artist.id}`)}
              >
                <Avatar
                  src={artist.profileImage || '/assets/images/default-user.jpg'}
                  sx={{ width: 80, height: 80 }}
                />
                <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, ml: 2, minWidth: 0 }}>
                  <Typography variant="subtitle1" fontWeight="bold">
                    {index + 1}. {artist.name || artist.artistName}
                  </Typography>
                  <Typography variant="caption" color="primary">
                    {artist.count || 0} seguidores nuevos
                  </Typography>
                </Box>
                <IconButton>
                  <PersonIcon />
                </IconButton>
              </Card>
            </Grid2>
          ))}
        </Grid2>
      )}

      {((tabValue === 0 && trendingTracks.length === 0) || (tabValue === 1 && trendingArtists.length === 0)) && !loading && (
        <Typography variant="body1" sx={{ mt: 2, fontStyle: 'italic' }}>
          No hay suficientes datos de tendencias aún.
        </Typography>
      )}
    </Box>
  );
};

export default TrendingSection;