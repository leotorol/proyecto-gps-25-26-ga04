import React, { useState, useEffect, useContext, useRef } from 'react';
import { 
  Typography, 
  Card, 
  CardContent, 
  Button, 
  Select, 
  MenuItem,
  CircularProgress,
  Snackbar,
  Alert
} from '@mui/material';
import Grid2 from '@mui/material/Grid2';
import { Link, useNavigate } from 'react-router-dom';
import { downloadTrack, downloadAlbum } from '../services/jamendoService';
import { statsService } from '../services/statsService'; 
import { AuthContext } from '../context/AuthContext'; 

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const { user, loading } = useContext(AuthContext); 
  
  const [orderSummary, setOrderSummary] = useState(null);
  const [selectedFormats, setSelectedFormats] = useState({});
  const [loadingDownload, setLoadingDownload] = useState({});
  const [notification, setNotification] = useState({ 
    open: false, 
    message: '', 
    severity: 'info' 
  });

  const eventSentRef = useRef(false);

  useEffect(() => {
    if (loading) return;

    const storedSummary = localStorage.getItem('orderSummary');
    if (!storedSummary) {
      navigate('/');
      return;
    }

    try {
      const parsedSummary = JSON.parse(storedSummary);
      setOrderSummary(parsedSummary);
      
      const initialFormats = {};
      if (parsedSummary.items) {
        for (const item of parsedSummary.items) {
          initialFormats[item.id] = 'mp3';
        }
      }
      setSelectedFormats(initialFormats);

      if (!parsedSummary.eventSent && !eventSentRef.current) {
        eventSentRef.current = true;

        setTimeout(() => {
          statsService.sendEvent('order.paid', {
            entityType: 'order',
            entityId: Date.now().toString(),
            userId: user?._id?.toString() ?? user?.id?.toString() ?? null,
            metadata: {
              price: Number(parsedSummary.total) || 0, 
              currency: 'EUR',
              itemsCount: parsedSummary.items?.length || 0,
            }
          }).then(() => {
            console.log('Evento de pago registrado');
            parsedSummary.eventSent = true;
            localStorage.setItem('orderSummary', JSON.stringify(parsedSummary));
          }).catch(err => console.warn('Error enviando stats:', err));
        }, 100);
      }

    } catch (error) {
      console.error("Error procesando resumen de pedido:", error);
      navigate('/');
    }
  }, [navigate, user, loading]);

  const handleFormatChange = (itemId, value) => {
    setSelectedFormats(prev => ({ ...prev, [itemId]: value }));
  };

  const showNotification = (message, severity = 'info') => {
    setNotification({ open: true, message, severity });
  };

  const handleCloseNotification = () => {
    setNotification({ ...notification, open: false });
  };

  const handleDownloadTrack = async (item) => {
    const format = selectedFormats[item.id] || 'mp3';
    setLoadingDownload(prev => ({ ...prev, [item.id]: true }));
    
    try {
      const trackId = item.trackId || item.id;
      const albumId = item.id; 
      await downloadTrack(trackId, albumId, format);
      showNotification(`Descarga de "${item.name || item.title}" completada con éxito`, 'success');
    } catch (error) {
      console.error('Error en la descarga:', error);
      showNotification(`Error al descargar: ${error?.message ?? 'Error desconocido'}`, 'error');
    } finally {
      setLoadingDownload(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const handleDownloadAlbum = async (item) => {
    const format = selectedFormats[item.id] || 'mp3';
    setLoadingDownload(prev => ({ ...prev, [item.id]: true }));
    
    try {
      const albumId = item.albumId || item.id;
      await downloadAlbum(albumId, format);
      showNotification(`Descarga del álbum "${item.name || item.title}" completada con éxito`, 'success');
    } catch (error) {
      console.error('Error en la descarga del álbum:', error);
      showNotification(`Error al descargar el álbum: ${error?.message ?? 'Error desconocido'}`, 'error');
    } finally {
      setLoadingDownload(prev => ({ ...prev, [item.id]: false }));
    }
  };

  const handleDownload = (item) => {
    if (item.type === 'album') {
      handleDownloadAlbum(item);
    } else {
      handleDownloadTrack(item);
    }
  };

  if (loading || !orderSummary?.items) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Procesando pedido...</Typography>
      </div>
    );
  }

  const { items } = orderSummary;

  return (
    <div style={{ padding: '2rem' }}>
      <Typography variant="h4" gutterBottom sx={{ color: '#1DA0C3', fontWeight: 'bold' }}>
        ¡Pago realizado con éxito!
      </Typography>
      <Typography variant="h6" gutterBottom>
        Resumen del pedido:
      </Typography>
      <Grid2 container spacing={2}>
        {items.map((item) => {
          const price = Number(item.price) || 0;
          const quantity = Number(item.quantity) || 1;
          const totalItem = price * quantity;
          const itemKey = item.id ?? item.trackId ?? item.name ?? `${price}-${quantity}`;

          return (
            <Grid2 xs={12} md={6} key={itemKey}>
              <Card sx={{ height: '100%' }}>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                    {item.name || "Producto"}
                  </Typography>
                  <Typography variant="body2">
                    Cantidad: {quantity}
                  </Typography>
                  <Typography variant="body2">
                    Precio: {price.toFixed(2)}€
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    Total: {totalItem.toFixed(2)}€
                  </Typography>
                  
                  {((item.type === 'song' && price > 0) || (item.type === 'album')) && (
                    <div style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                      <Typography variant="body2" style={{ marginBottom: '0.5rem' }}>
                        <strong>Descargar contenido:</strong>
                      </Typography>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                        <Select
                          value={selectedFormats[item.id] || 'mp3'}
                          onChange={(e) => handleFormatChange(item.id, e.target.value)}
                          size="small"
                          disabled={loadingDownload[item.id]}
                          sx={{ minWidth: 120 }}
                        >
                          <MenuItem value="mp3">MP3</MenuItem>
                          <MenuItem value="wav">WAV</MenuItem>
                          <MenuItem value="flac">FLAC</MenuItem>
                        </Select>
                        <Button 
                          variant="contained" 
                          color="primary" 
                          onClick={() => handleDownload(item)}
                          disabled={loadingDownload[item.id]}
                          startIcon={loadingDownload[item.id] ? <CircularProgress size={20} color="inherit" /> : null}
                        >
                          {loadingDownload[item.id] ? 'Procesando...' : 'Descargar'}
                        </Button>
                      </div>
                      {item.type === 'album' && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                          Se descargarán todas las pistas en un archivo ZIP.
                        </Typography>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Grid2>
          );
        })}
      </Grid2>
      
      <Button 
        variant="contained" 
        color="secondary" 
        style={{ marginTop: '2rem' }} 
        component={Link} 
        to="/"
      >
        Volver al Inicio
      </Button>
      
      <Snackbar 
        open={notification.open} 
        autoHideDuration={6000} 
        onClose={handleCloseNotification}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseNotification} severity={notification.severity} sx={{ width: '100%' }}>
          {notification.message}
        </Alert>
      </Snackbar>
    </div>
  );
};

export default PaymentSuccess;