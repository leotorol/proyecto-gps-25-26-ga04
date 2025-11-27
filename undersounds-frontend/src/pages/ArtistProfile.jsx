import React, { useState, useContext, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useParams, useNavigate } from 'react-router-dom';
import { Typography, Box, Tab, Tabs } from '@mui/material';
import Grid2 from '@mui/material/Grid2';
import '../styles/artistprofile.css';
import { AuthContext } from '../context/AuthContext';
import albumIMG from '../assets/images/albumPortada.jpg';
import { fetchArtistById } from '../services/artistService';
import { merchService } from '../services/merchandisingService';
import { formatDate } from '../utils/formatters';
import { statsService } from '../services/statsService';
import { toggleFollowArtist } from '../services/authService';

const CustomTabPanel = ({ children, value, index }) => {
  return (
    <Box
      role="tabpanel"
      hidden={value !== index}
      id={`simple-tabpanel-${index}`}
      aria-labelledby={`simple-tab-${index}`}
      sx={{ p: 2, height: '87%', margin: 0, pr: 1 }}
      className="tab-panel"
    >
      {value === index && <Box>{children}</Box>}
    </Box>
  );
};

CustomTabPanel.propTypes = {
  children: PropTypes.node,
  value: PropTypes.number.isRequired,
  index: PropTypes.number.isRequired,
};

const ArtistProfile = () => {
  const { id } = useParams();
  const numericId = Number.parseInt(id);
  const navigate = useNavigate();
  const { user, setUser } = useContext(AuthContext);
  const [merch, setMerch] = useState([]);

  const [artist, setArtist] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [value, setValue] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);

  const handleTshirtClick = (tshirt_Id) => {
    navigate(`/tshirt/${tshirt_Id}`);
  };

  useEffect(() => {
    fetchArtistById(numericId)
      .then((data) => {
        setArtist(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Error fetching artist:', err);
        setError(err);
        setLoading(false);
      });
  }, [numericId]);

  useEffect(() => {
    const loadMerch = async () => {
      try {
        const merchData = await merchService.getMerchByArtist(id);
        setMerch(merchData);
      } catch (err) {
        console.error('Error fetching merch:', err);
      }
    };
    loadMerch();
  }, [id]);

  useEffect(() => {
    if (user && artist) {
      const artistIdStr = String(artist.id || artist._id);
      const isFav = user.following?.includes(artistIdStr);
      setIsFollowing(!!isFav);
    }
  }, [user, artist]);

  if (loading) {
    return <Typography variant="h5">Cargando...</Typography>;
  }
  if (error || !artist) {
    return <Typography variant="h5">Artista no encontrado</Typography>;
  }

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  const a11yProps = (index) => ({
    id: `simple-tab-${index}`,
    'aria-controls': `simple-tabpanel-${index}`,
  });

  const handleFollow = async () => {
    if (!user) {
      navigate('/register');
      return;
    }

    const prevStatus = isFollowing;
    setIsFollowing(!prevStatus);

    const artistIdStr = String(artist.id || artist._id);

    try {
      await toggleFollowArtist(artistIdStr);

      if (setUser) {
        setUser((prevUser) => {
          const currentFollowing = prevUser.following || [];
          let newFollowing;

          if (prevStatus) {
            newFollowing = currentFollowing.filter((fid) => fid !== artistIdStr);
          } else {
            newFollowing = currentFollowing.includes(artistIdStr)
              ? currentFollowing
              : [...currentFollowing, artistIdStr];
          }

          return { ...prevUser, following: newFollowing };
        });
      }

      if (!prevStatus) {
        await statsService.sendEvent('artist.followed', {
          entityType: 'artist',
          entityId: artistIdStr,
          userId: user.id || user._id,
          metadata: { artistName: artist.name }
        });
      }
    } catch (err) {
      console.error('Error al seguir artista', err);
      setIsFollowing(prevStatus);
    }
  };

  const renderAlbums = (albumsArray) => {
    return (
      <Grid2
        container
        spacing={2}
        justifyContent="flex-start"
        className="tab-content"
        sx={{
          maxHeight: '400px',
          overflowY: 'auto',
          marginBottom: '20px'
        }}
      >
        {albumsArray.map((album) => (
          <Grid2
            key={album.id}
            size={{ xs: 6, sm: 2, md: 3, lg: 3 }}
            sx={{ display: 'flex', flexDirection: 'column', position: 'relative' }}
            className="grid-item"
            onClick={() =>
              navigate(`/album/${album.id}`, {
                state: {
                  album: {
                    ...album,
                    artist: artist.name
                  }
                }
              })
            }
            style={{ cursor: 'pointer' }}
          >
            <div className="image-container">
              <img
                src={album.coverImage || albumIMG}
                alt={album.title}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  borderRadius: '0px',
                  objectFit: 'cover',
                }}
              />
            </div>
            <Typography variant="h8" sx={{ textAlign: 'left' }} className="item-title">
              {album.title}
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'left' }} className="item-details">
              Año: {album.releaseYear}
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'left' }} className="item-details">
              Género: {album.genre}
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'left' }} className="item-details">
              Precio: ${album.price}
            </Typography>
          </Grid2>
        ))}
      </Grid2>
    );
  };

  const renderMerchandise = (merchandise) => {
    return (
      <Grid2
        container
        spacing={2}
        justifyContent="flex-start"
        className="tab-content"
        sx={{
          maxHeight: '400px',
          overflowY: 'auto',
          marginBottom: '20px'
        }}
      >
        {merchandise.map((item) => (
          <Grid2
            key={item.id}
            size={{ xs: 6, sm: 2, md: 3, lg: 3 }}
            sx={{ display: 'flex', flexDirection: 'column' }}
            className="grid-item"
            onClick={() => handleTshirtClick(item._id)}
            style={{ cursor: 'pointer' }}
          >
            <div className="image-container">
              <img
                src={item.merchImage || item.tshirtImage || item.image}
                alt={item.name}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  borderRadius: '0px',
                  objectFit: 'cover',
                }}
              />
            </div>
            <Typography variant="h8" sx={{ textAlign: 'left', marginTop: '8px' }} className="item-title">
              {item.name}
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'left' }} className="item-details">
              Precio: ${item.price}
            </Typography>
          </Grid2>
        ))}
      </Grid2>
    );
  };

  const renderConcerts = (concerts) => {
    return (
      <Grid2
        container
        spacing={2}
        justifyContent="flex-start"
        className="tab-content"
        sx={{
          maxHeight: '400px',
          overflowY: 'auto',
          marginBottom: '20px'
        }}
      >
        {concerts.map((concert) => (
          <Grid2
            key={concert.id}
            size={{ xs: 6, sm: 2, md: 3, lg: 3 }}
            sx={{ display: 'flex', flexDirection: 'column' }}
            className="grid-item"
            onClick={() => navigate(`/concert/${artist.id}/${concert.id}`, { state: { concert } })}
            style={{ cursor: 'pointer' }}
          >
            <div
              style={{
                width: '100%',
                paddingTop: '100%',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '0px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
              }}
            >
              <img
                src={concert.concertImage}
                alt={`Concert at ${concert.location}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
            <Typography variant="h8" sx={{ textAlign: 'left' }} className="item-title">
              Concierto en {concert.location}
            </Typography>
            <Typography variant="body2" sx={{ textAlign: 'left' }} className="item-details">
              Fecha: {formatDate(concert.date)}
            </Typography>
          </Grid2>
        ))}
      </Grid2>
    );
  };

  return (
    <Box
      sx={{
        backgroundImage: `url(${artist.banner})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        width: '100%',
        maxHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '50px',
      }}
    >
      <Grid2
        container
        spacing={2}
        justifyContent="center"
        alignItems="center"
        sx={{ paddingRight: '300px', paddingLeft: '300px', paddingTop: '150px' }}
        className="container"
      >
        <Grid2 size={12} container sx={{ height: '80%', border: '1px solid black', backgroundColor: 'rgba(255, 255, 255, 0.8)' }}>
          <Grid2 size={10} sx={{ borderRight: '2px solid black', marginTop: '-15px', paddingBottom: '30px' }}>
            <Box sx={{ borderBottom: 2, borderColor: 'divider' }}>
              <Tabs
                value={value}
                onChange={handleChange}
                aria-label="artist tabs"
                sx={{
                  '& .MuiTab-root': { color: 'black' },
                  '& .Mui-selected': { color: 'black', fontWeight: 'bold' },
                  '& .MuiTabs-indicator': { backgroundColor: 'black' },
                }}
              >
                <Tab label="Álbumes" {...a11yProps(0)} />
                <Tab label="Merchandising" {...a11yProps(1)} />
                <Tab label="Conciertos" {...a11yProps(2)} />
              </Tabs>
            </Box>
            <CustomTabPanel value={value} index={0}>
              {artist.albums && artist.albums.length > 0 ? (
                renderAlbums(artist.albums)
              ) : (
                <Typography variant="body1">No hay álbumes</Typography>
              )}
            </CustomTabPanel>
            <CustomTabPanel value={value} index={1}>
              {artist.merchandising && artist.merchandising.length > 0 ? (
                renderMerchandise(merch)
              ) : (
                <Typography variant="body1">No hay merchandising</Typography>
              )}
            </CustomTabPanel>
            <CustomTabPanel value={value} index={2}>
              {artist.concerts && artist.concerts.length > 0 ? (
                renderConcerts(artist.concerts)
              ) : (
                <Typography variant="body1">No hay conciertos</Typography>
              )}
            </CustomTabPanel>
            <Typography sx={{ fontSize: '12px', textAlign: 'left', marginLeft: '10px', marginTop: '10px' }} className="artist-name">
              © 2025 {artist.name}. Todos los derechos reservados.
            </Typography>
          </Grid2>
          <Grid2 size={2} sx={{ textAlign: 'center', marginTop: '80px' }}>
            <div className="profile-image-container">
              <img src={artist.profileImage} alt={artist.name} className="profile-image" />
            </div>
            <Typography sx={{ fontSize: '25px', textAlign: 'left', marginLeft: '10px' }} className="artist-name">
              {artist.name}
            </Typography>
            <Typography sx={{ fontSize: '12px', textAlign: 'left', marginLeft: '10px' }} className="artist-name">
              {artist.ubicacion}
            </Typography>
            <button
              id="btn-seguir"
              type="button"
              className={`btn-seguir ${isFollowing ? 'siguiendo' : ''}`}
              onClick={handleFollow}
            >
              {isFollowing ? 'Siguiendo' : 'Seguir'}
            </button>
            <Typography
              variant="h6"
              sx={{
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#4A90E2',
                textAlign: 'left',
                padding: '8px',
                borderRadius: '5px',
                boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.1)',
                alignItems: 'center',
              }}
              className="artist-bio"
            >
              Seguidores: {artist.seguidores}
            </Typography>
            <Typography
              variant="h6"
              sx={{ marginTop: '15px', fontSize: '15px', textAlign: 'justify', boxShadow: '0px 2px 4px rgba(0,0,0,0.1)' }}
              className="artist-bio"
            >
              {artist.bio}
            </Typography>
            <Typography variant="h6" sx={{ marginTop: '15px', fontSize: '15px', textAlign: 'justify' }} className="artist-bio">
              <a
                href={artist.socialLinks.instagram}
                style={{ textDecoration: 'none', color: '#333' }}
                onMouseEnter={(e) => {
                  e.target.style.textDecoration = 'underline';
                }}
                onMouseLeave={(e) => {
                  e.target.style.textDecoration = 'none';
                }}
              >
                Instagram.
              </a>
            </Typography>
            <Typography variant="h6" sx={{ marginTop: '0px', fontSize: '15px', textAlign: 'justify' }} className="artist-bio">
              <a
                href={artist.socialLinks.twitter}
                style={{ textDecoration: 'none', color: '#333' }}
                onMouseEnter={(e) => {
                  e.target.style.textDecoration = 'underline';
                }}
                onMouseLeave={(e) => {
                  e.target.style.textDecoration = 'none';
                }}
              >
                Twitter.
              </a>
            </Typography>
            <Typography variant="h6" sx={{ marginBottom: '10px', fontSize: '15px', textAlign: 'justify' }} className="artist-bio">
              <a
                href={artist.socialLinks.facebook}
                style={{ textDecoration: 'none', color: '#333' }}
                onMouseEnter={(e) => {
                  e.target.style.textDecoration = 'underline';
                }}
                onMouseLeave={(e) => {
                  e.target.style.textDecoration = 'none';
                }}
              >
                Facebook.
              </a>
            </Typography>
          </Grid2>
        </Grid2>
      </Grid2>
    </Box>
  );
};

export default ArtistProfile;