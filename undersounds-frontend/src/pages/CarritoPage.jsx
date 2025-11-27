import React, { useContext, useState } from 'react';
import { CartContext } from '../context/CartContext';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import '../styles/carrito.css';
import IconButton from '@mui/material/IconButton';
import AddIcon from '@mui/icons-material/Add';
import RemoveIcon from '@mui/icons-material/Remove';
import DeleteIcon from '@mui/icons-material/Delete';
import { Box, Typography } from '@mui/material';
import axios from 'axios';


const CarritoPage = () => {
  const { cartItems, updateQuantity, removeFromCart } = useContext(CartContext);
  const { user } = useContext(AuthContext);
  const navigate = useNavigate();
  const [acceptedTerms, setAcceptedTerms] = useState(false)

  // Calcular el total considerando la cantidad de cada producto
  const total = cartItems.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);

  const handlePago = async () => {
    try {
      const response = await axios.post('http://localhost:5001/create-checkout-session', {
        items: cartItems,
      });
      globalThis.location.href = response.data.url;
    } catch (error) {
      console.error('Error iniciando pago:', error);
      alert('Error al iniciar el pago.');
    }
  };

  const handleCheckout = () => {
    if (!acceptedTerms) {
      alert('Debes aceptar los términos y condiciones para proceder a la compra.');
      return;
    }

    if (cartItems.length === 0) {
      alert("El carrito está vacío. Agrega productos antes de proceder al pago.");
      return;
    }
    if (!user) {
      // Redirigir a la página de login si el usuario no está logueado
      navigate('/login');
      return;
    }
  
    // Crear el resumen del pedido: items del carrito y total (añadiendo, por ejemplo, gastos de envío)
    const orderSummary = {
      items: cartItems,
      total: total 
    };
  
    // Guardar el resumen en localStorage
    globalThis.localStorage.setItem('orderSummary', JSON.stringify(orderSummary));
  
    // Iniciar el proceso de pago (por ejemplo, llamando a Stripe)
    handlePago();
  };



  return (
    <div className="carrito-page">
      <div className="cart-summary">
        <h2>Resumen</h2>
        <p>Total: {total.toFixed(2)}€</p>
        {/* ------------------ bloque de términos ------------------ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
            />
            <span style={{ marginLeft: 8 }}>Acepto los términos y condiciones</span>
          </label>
          <button
            type="button"
            onClick={() => {
              alert('Términos y condiciones:\n\nAl realizar la compra aceptas las condiciones de uso y política de devoluciones.');
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#1976d2',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            Ver términos
          </button>
        </div>
        {/* --------------------------------------------------------- */}
        <button className="proceed-button" onClick={handleCheckout}>
          Proceder al pago
        </button>
      </div>
      <h1>Carrito de Compra</h1>
      {cartItems.length === 0 ? (
        <p>El carrito está vacío</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {cartItems.map((item) => (
            <li key={item.id}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  p: 2,
                  mb: 2,
                  border: '1px solid #ddd',
                  borderRadius: 2,
                  boxShadow: '0px 2px 4px rgba(0,0,0,0.1)',
                }}
              >
                <img
                  src={item.image}
                  alt={item.name}
                  style={{ width: '80px', borderRadius: '8px' }}
                />
                <Box sx={{ flex: 1, ml: 2 }}>
                  <Typography variant="subtitle1">{item.name}</Typography>
                  <Typography variant="body2">
                    {item.price.toFixed(2)}€
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    sx={{
                      backgroundColor: '#d5d5d5',
                      p: 0.25, // Padding reducido
                      '&:hover': { backgroundColor: '#51CBCE' },
                    }}
                  >
                    <RemoveIcon fontSize="small" />
                  </IconButton>
                  <Typography variant="body1">{item.quantity}</Typography>
                  <IconButton
                    size="small"
                    color="primary"
                    onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    sx={{
                      backgroundColor: '#d5d5d5',
                      p: 0.25, // Padding reducido
                      '&:hover': { backgroundColor: '#51CBCE' },
                    }}
                  >
                    <AddIcon fontSize="small" />
                  </IconButton>
                </Box>
                <IconButton
                  color="error"
                  onClick={() => removeFromCart(item.id)}
                  sx={{
                    backgroundColor: '#ffffff',
                    borderRadius: '50%',
                    p: 0.5,
                    '&:hover': {
                      backgroundColor: '#ffe6e6',
                    },
                  }}
                >
                  <DeleteIcon />
                </IconButton>
              </Box>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CarritoPage;