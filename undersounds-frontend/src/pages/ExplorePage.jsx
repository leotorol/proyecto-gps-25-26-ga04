import React, { useEffect, useState } from 'react';
import { Box, TextField, Tabs, Tab, Typography } from '@mui/material';
import Grid2 from '@mui/material/Grid2';
import { Link, useLocation } from 'react-router-dom';
import { getFormattedAlbumDuration } from '../utils/formatters';
import { fetchAlbums } from '../services/jamendoService';
import { fetchArtists } from '../services/artistService';
import '../styles/explorepage.css';

const ExplorePage = () => {
  // States for data
  const [albums, setAlbums] = useState([]);
  const [artists, setArtists] = useState([]);
  const [tracks, setTracks] = useState([]);

  // States for search and filtering
  const [searchTerm, setSearchTerm] = useState('all');
  const [filter, setFilter] = useState('all');
  const location = useLocation();

  // Get URL parameters
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get('q') || '';
    const f = params.get('filter') || 'all';
    setSearchTerm(q);
    setFilter(f);
  }, [location.search]);

  useEffect(() => {
    if (!filter) setFilter('all');
  }, [filter]);

  // Load albums from the database using fetchAlbums
  useEffect(() => {
    const loadAlbums = async () => {
      try {
        const fetchedAlbums = await fetchAlbums();
        setAlbums(fetchedAlbums);
      } catch (error) {
        console.error('Error fetching albums:', error);
      }
    };
    loadAlbums();
  }, []);

  // Load artists using fetchArtists
  useEffect(() => {
    const loadArtists = async () => {
      try {
        const fetchedArtists = await fetchArtists();
        setArtists(fetchedArtists);
      } catch (error) {
        console.error('Error fetching artists:', error);
      }
    };
    loadArtists();
  }, []);

  // Extract tracks from the loaded albums and attach album info to each track
  useEffect(() => {
    if (albums.length > 0) {
      const allTracks = albums.flatMap(album =>
        (album.tracks || []).map(track => ({
          ...track,
          album_id: album.id,
          album_name: album.name || album.title,
          album_cover: album.coverImage || album.image || '/assets/images/default-cover.jpg',
        }))
      );
      setTracks(allTracks);
    }
  }, [albums]);

  // Effective search query (empty string if 'all')
  const effectiveSearchQuery =
    searchTerm.toLowerCase() === 'all' ? '' : searchTerm.toLowerCase();

  const getFilteredAlbums = () =>
    albums.filter(album => {
      const albumName = (album.name || album.title || '').toLowerCase();
      return albumName.includes(effectiveSearchQuery);
    });

  const getFilteredTracks = () =>
    tracks.filter(track => {
      const title = (track.title || track.track_name || track.name || '').toLowerCase();
      const artist = (track.artist_name || track.artist || '').toLowerCase();
      const albumRef = (track.album_name || '').toLowerCase();
      return (
        title.includes(effectiveSearchQuery) ||
        artist.includes(effectiveSearchQuery) ||
        albumRef.includes(effectiveSearchQuery)
      );
    });

  const getFilteredArtists = () =>
    artists.filter(artist =>
      artist.name.toLowerCase().includes(effectiveSearchQuery)
    );

  // Render an album with its details
  const renderAlbumItem = (album) => (
    <Grid2 key={album.id} className="item-container">
      <Grid2
        container
        spacing={2}
        alignItems="center"
        className="album-item"
        wrap="nowrap"
        style={{ gap: '10px' }}
      >
        <Grid2 xs="auto" sm="auto">
          <div className="album-image-container">
            <img
              src={
                album.coverImage ||
                album.image ||
                '/assets/images/default-cover.jpg'
              }
              alt={album.name || album.title}
              className="album-image"
              style={{
                width: '100%',
                height: 'auto',
                borderRadius: '8px',
              }}
            />
          </div>
        </Grid2>
        <Grid2 xs={6} sm={8}>
          <div className="album-details">
            <Typography
              variant="caption"
              display="block"
              className="item-type"
            >
              Album
            </Typography>
            <Typography variant="h6" className="album-title">
              <Link to={`/album/${album.id}`}>
                {album.name || album.title}
              </Link>
            </Typography>
            <Typography variant="body1" className="album-artist">
              {album.artist || album.artist_name}
            </Typography>
            <br />
            <Typography variant="body2" className="album-details">
              {album.tracks ? album.tracks.length : 0} tracks, {getFormattedAlbumDuration(album)}
            </Typography>
            <Typography variant="body2" className="album-details">
              Publicado en {album.releaseYear || album.releasedate}
            </Typography>
            <Typography variant="body2" className="album-details">
              Genre: {album.genre}
            </Typography>
          </div>
        </Grid2>
      </Grid2>
    </Grid2>
  );

  // Render a track item with album details included
  const renderTrackItem = (track) => (
    <Grid2 key={track.id} className="item-container">
      <Grid2 container spacing={2} alignItems="flex-start" className="track-item" wrap="nowrap" style={{ gap: '10px' }}>
        <Grid2 xs="auto" sm="auto">
          <div className="track-image-container">
            <img
              src={track.album_cover || track.artwork || '/assets/images/default-cover.jpg'}
              alt={track.track_name || track.name}
              className="track-image"
              style={{ width: '100%', height: 'auto', borderRadius: '8px' }}
            />
          </div>
        </Grid2>
        <Grid2 xs={6} sm={8}>
          <div className="track-details" style={{ textAlign: 'left' }}>
            <Typography variant="caption" display="block" className="item-type">
              Canción
            </Typography>
            <Typography variant="h6" className="track-title">
              {track.title || track.track_name || track.name || 'Sin título'}
            </Typography>
            <Typography variant="body1" className="track-artist">
              {track.artist_name || track.artist}
            </Typography>
            <Typography variant="body2" className="track-album">
              Álbum:{' '}
              <Link to={`/album/${track.album_id}`}>
                {track.album_name}
              </Link>
            </Typography>
            <Typography variant="body2" className="track-info">
              Duración: {track.duration}
            </Typography>
          </div>
        </Grid2>
      </Grid2>
    </Grid2>
  );

  // Render an artist item
  const renderArtistItem = (artist) => (
    <Grid2 key={artist.id} className="item-container">
      <Grid2
        container
        spacing={2}
        alignItems="center"
        className="album-item"
        wrap="nowrap"
        style={{ gap: '10px' }}
      >
        <Grid2 xs="auto" sm="auto">
          <div className="album-image-container">
            <img
              src={
                artist.profileImage ||
                '/assets/images/default-avatar.jpg'
              }
              alt={artist.name}
              className="album-image"
              style={{ width: '100%', height: '100%', borderRadius: '8px' }}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/assets/images/default-avatar.jpg';
              }}
            />
          </div>
        </Grid2>
        <Grid2 xs={6} sm={8}>
          <div className="album-details">
            <Typography
              variant="caption"
              display="block"
              className="item-type"
            >
              Artist
            </Typography>
            <Typography variant="h6" className="album-title">
              <Link to={`/artistProfile/${artist.id}`}>
                {artist.name}
              </Link>
            </Typography>
            {artist.genre && (
              <Typography variant="body1" className="album-artist">
                {artist.genre}
              </Typography>
            )}
          </div>
        </Grid2>
      </Grid2>
    </Grid2>
  );

  // Build filtered content based on selected filter
  let filteredContent = null;
  if (filter === 'all') {
    filteredContent = (
      <>
        {getFilteredAlbums().length > 0 && (
          <div className="filtered-section">
            <Grid2 container direction="column" spacing={2}>
              {getFilteredAlbums().map(renderAlbumItem)}
            </Grid2>
          </div>
        )}
        {getFilteredTracks().length > 0 && (
          <div className="filtered-section">
            <Grid2 container direction="column" spacing={2}>
              {getFilteredTracks().map(renderTrackItem)}
            </Grid2>
          </div>
        )}
        {getFilteredArtists().length > 0 && (
          <div className="filtered-section">
            <Grid2 container direction="column" spacing={2}>
              {getFilteredArtists().map(renderArtistItem)}
            </Grid2>
          </div>
        )}
      </>
    );
  } else if (filter === 'albums') {
    filteredContent = (
      <div className="filtered-section">
        <Grid2 container direction="column" spacing={2}>
          {getFilteredAlbums().map(renderAlbumItem)}
          {getFilteredAlbums().length === 0 && (
            <Grid2>
              <div className="no-results">No albums found</div>
            </Grid2>
          )}
        </Grid2>
      </div>
    );
  } else if (filter === 'tracks') {
    filteredContent = (
      <div className="filtered-section">
        <Grid2 container direction="column" spacing={2}>
          {getFilteredTracks().map(renderTrackItem)}
          {getFilteredTracks().length === 0 && (
            <Grid2>
              <div className="no-results">No tracks found</div>
            </Grid2>
          )}
        </Grid2>
      </div>
    );
  } else if (filter === 'artists') {
    filteredContent = (
      <div className="filtered-section">
        <Grid2 container direction="column" spacing={2}>
          {getFilteredArtists().map(renderArtistItem)}
          {getFilteredArtists().length === 0 && (
            <Grid2>
              <div className="no-results">No artists found</div>
            </Grid2>
          )}
        </Grid2>
      </div>
    );
  }

  return (
    <div className="explore-page">
      <Box
        sx={{
          background: 'linear-gradient(to right, #f8f9fa, #e9ecef)',
          borderRadius: '12px',
          p: 3,
          mb: 3,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}
      >
        <Typography
          variant="h3"
          className="main-title"
          sx={{
            fontFamily: '"Montserrat", sans-serif',
            letterSpacing: '0.1em',
            fontWeight: 700,
            textTransform: 'uppercase',
            textAlign: 'center',
            mb: 2,
          }}
        >
          Explorar Música
        </Typography>
        <TextField
          variant="outlined"
          fullWidth
          placeholder="Search music, albums, tracks, artists..."
          value={searchTerm}
          onChange={(e) => {
            setFilter('all');
            setSearchTerm(e.target.value);
          }}
          sx={{
            backgroundColor: '#fff',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        />
        {/* Tabs for filtering */}
        <Box
          sx={{
            mt: 2,
            backgroundColor: '#1da0c3',
            borderRadius: '8px',
            py: 0,
            px: 1,
          }}
        >
          <Tabs
            value={filter}
            onChange={(event, newValue) => setFilter(newValue)}
            textColor="inherit"
            indicatorColor="secondary"
            variant="fullWidth"
            sx={{ minHeight: 'auto' }}
          >
            <Tab label="All" value="all" sx={{ flex: 1, color: 'white', fontSize: '0.9rem', py: 0.2 }} />
            <Tab label="Albums" value="albums" sx={{ flex: 1, color: 'white', fontSize: '0.9rem', py: 0.2 }} />
            <Tab label="Tracks" value="tracks" sx={{ flex: 1, color: 'white', fontSize: '0.9rem', py: 0.2 }} />
            <Tab label="Artists" value="artists" sx={{ flex: 1, color: 'white', fontSize: '0.9rem', py: 0.2 }} />
          </Tabs>
        </Box>
      </Box>
      <div className="results">{filteredContent}</div>
    </div>
  );
};

export default ExplorePage;