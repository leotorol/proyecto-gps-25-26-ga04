import React, { useEffect, useState, useContext } from 'react';
import { Box, Typography, Grid, Card, CardMedia, CardContent, Button } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { statsService } from '../../services/statsService';
import { fetchAlbumById } from '../../services/jamendoService';
import { fetchArtistById } from '../../services/artistService';
import { AuthContext } from '../../context/AuthContext';

const UserRecommendations = ({ limit = 8 }) => {
  const { user } = useContext(AuthContext);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user?.id && !user?._id) {
      setLoading(false);
      return;
    }
    const userId = user.id || user._id;
    const load = async () => {
      setLoading(true);
      try {
        const recs = await statsService.getUserRecommendations(userId, limit);

        const enriched = await Promise.all(recs.map(async (r) => {
          try {
            if (r.type === 'album') {
              const album = await fetchAlbumById(r.id);
              return { ...r, album };
            }
            if (r.type === 'artist') {
              const artist = await fetchArtistById(r.id);
              return { ...r, artist };
            }
          } catch (e) {
            // ignore enrichment errors, return original
          }
          return r;
        }));

        setItems(enriched);
      } catch (err) {
        console.error('Error loading user recommendations', err);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, limit]);

  const handleClick = (it, e) => {
    if (e) e.stopPropagation();
    if (it.type === 'album') {
      const albumId = it.album?.id || it.id;
      if (it.album) {
        navigate(`/album/${albumId}`, { state: { album: it.album } });
      } else {
        navigate(`/album/${albumId}`);
      }
    } else if (it.type === 'artist') {
      const artistId = it.artist?.id || it.id;
      navigate(`/artistProfile/${artistId}`, { state: { artist: it.artist } });
    } else {
      navigate(`/album/${it.id}`);
    }
  };

  if (loading) return <Typography>Loading recommendations...</Typography>;
  if (!items || items.length === 0) return <Typography>No hay recomendaciones todavía.</Typography>;

  return (
    <Box sx={{ mt: 4 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>Para ti</Typography>
      <Grid container spacing={2}>
        {items.map((it, idx) => {
          const key = it.id || it.album?.id || idx;

          // Title / subtitle logic
          let title = 'Item';
          let subtitle = '';
          let img = '/assets/images/default-cover.jpg';

          if (it.type === 'album') {
            title = it.album?.title || it.title || 'Álbum';
            // artist can be string or object
            const artistField = it.album?.artist || it.album?.artistName || it.artist || it.artistName;
            if (typeof artistField === 'string') {
              subtitle = artistField;
            } else if (artistField && typeof artistField === 'object') {
              subtitle = artistField.name || artistField.bandName || '';
              img = artistField.profileImage || it.album?.coverImage || img;
            } else {
              subtitle = it.album?.artist || '';
            }
            img = it.album?.coverImage || img;
          } else if (it.type === 'artist') {
            title = it.artist?.name || it.name || it.artistName || 'Artista';
            subtitle = it.artist?.genre || '';
            img = it.artist?.profileImage || it.profileImage || '/assets/images/default-user.jpg';
          } else {
            title = it.title || it.name || 'Item';
            subtitle = it.artist || it.album?.artist || '';
            img = it.coverImage || it.album?.coverImage || img;
          }

          return (
            <Grid item xs={12} sm={6} md={3} key={key}>
              <Card
                sx={{ cursor: 'pointer', height: '100%', display: 'flex', flexDirection: 'column' }}
                onClick={(e) => handleClick(it, e)}
              >
                <CardMedia
                  component="img"
                  image={img}
                  alt={title}
                  sx={{ height: 140, objectFit: 'cover' }}
                />
                <CardContent sx={{ flex: 1 }}>
                  <Typography variant="subtitle1" noWrap>{title}</Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>{subtitle}</Typography>
                </CardContent>
                <Box sx={{ p: 1 }}>
                  <Button fullWidth size="small" variant="outlined" onClick={(e) => handleClick(it, e)}>Ver</Button>
                </Box>
              </Card>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default UserRecommendations;