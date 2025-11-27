import React, { useContext } from 'react';
import PropTypes from 'prop-types';
import { Dialog, DialogTitle, DialogContent, Button, Grid2, Divider, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';
import { RegisterContext } from '../../context/RegisterContext';
import signupFan from '../../assets/images/icon-fans.svg';
import signupBand from '../../assets/images/icon-artists.svg';
import signupLabel from '../../assets/images/icon-labels.svg';

const SignUpDialog = ({ open, handleClose }) => {
  const { setRegisterType } = useContext(RegisterContext);
  const navigate = useNavigate();

  const handleRegisterClick = (type) => {
    setRegisterType(type);
    handleClose();
    navigate('/register');
  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          sx: {
            display: 'flex',
            flexDirection: 'column',
            maxHeight: 'calc(100vh - 32px)'
          }
        }
      }}
    >
      <DialogTitle 
        sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          fontSize: '24px', 
          fontWeight: 'bold'
        }}
      >
        Crea tu cuenta de Undersounds
      </DialogTitle>
      <DialogContent sx={{ flex: '1 1 auto', p: 2 }}>
        <Grid2 container spacing={2} sx={{ backgroundColor: '#FFFFFF', p: 2 }}>
          <Grid2 size={12}>
            <Grid2 container spacing={2}>
              <Grid2 size={6}>
                <img 
                  src={signupFan} 
                  alt="SignUp Fan Logo" 
                  style={{ height: '140px', borderRadius: '8px' }}
                />
              </Grid2>
              <Grid2 size={6}>
                <Button 
                  sx={{ 
                    mt: 2, 
                    p: 2, 
                    width: '100%', 
                    height: '30%', 
                    backgroundColor: '#FFFFFF', 
                    color: '#3bb1ce', 
                    borderColor: '#3bb1ce', 
                    borderWidth: 2 
                  }}
                  variant="outlined"  
                  onClick={() => handleRegisterClick('fan')}
                >
                  Registrarse como Fan
                </Button>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Regístrate como fan para seguir a tus artistas favoritos y descubrir nueva música.
                </Typography>
              </Grid2>
            </Grid2>
          </Grid2>
          <Divider sx={{ width: '100%', my: 2, backgroundColor: 'grey' }} />
          <Grid2 size={12}>
            <Grid2 container spacing={2}>
              <Grid2 size={6}>
                <img 
                  src={signupBand}
                  alt="SignUp Band Logo" 
                  style={{ height: '140px', borderRadius: '8px' }} 
                />
              </Grid2>
              <Grid2 size={6}>
                <Button 
                  sx={{ 
                    mt: 2, 
                    p: 2, 
                    width: '100%', 
                    height: '30%', 
                    backgroundColor: '#FFFFFF', 
                    color: '#619728', 
                    borderColor: '#b9eb87', 
                    borderWidth: 2 
                  }}
                  variant="outlined" 
                  fullWidth 
                  onClick={() => handleRegisterClick('band')}
                >
                  Registrarse como Banda
                </Button>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Regístrate como banda para compartir tu música y conectar con tus fans.
                </Typography>
              </Grid2>
            </Grid2>
          </Grid2>
          <Divider sx={{ width: '100%', my: 2, backgroundColor: 'grey' }} />
          <Grid2 size={12}>
            <Grid2 container spacing={2}>
              <Grid2 size={6}>
                <img 
                  src={signupLabel} 
                  alt="SignUp Label Logo" 
                  style={{ height: '140px', borderRadius: '8px' }} 
                />
              </Grid2>
              <Grid2 size={6}>
                <Button 
                  sx={{ 
                    mt: 2, 
                    p: 2, 
                    width: '100%', 
                    height: '30%', 
                    backgroundColor: '#FFFFFF', 
                    color: '#9911ff', 
                    borderColor: '#9911ff', 
                    borderWidth: 2 
                  }}
                  variant="outlined" 
                  fullWidth 
                  onClick={() => handleRegisterClick('label')}
                >
                  Registrarse como Sello Discográfico
                </Button>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Regístrate como sello discográfico para gestionar tus artistas y lanzamientos.
                </Typography>
              </Grid2>
            </Grid2>
          </Grid2>
        </Grid2>
      </DialogContent>
    </Dialog>
  );
};

SignUpDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  handleClose: PropTypes.func.isRequired,
};

export default SignUpDialog;