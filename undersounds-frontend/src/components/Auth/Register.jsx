import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { RegisterContext } from '../../context/RegisterContext.jsx';
import { register } from '../../services/authService';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import CssBaseline from '@mui/material/CssBaseline';
import FormControl from '@mui/material/FormControl';
import FormLabel from '@mui/material/FormLabel';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Stack from '@mui/material/Stack';
import MuiCard from '@mui/material/Card';
import Alert from '@mui/material/Alert';
// IMPORTACIONES NUEVAS
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
// -------------------
import { styled } from '@mui/material/styles';
import AppTheme from '../themes/AuthTheme/AuthTheme.jsx';

const Card = styled(MuiCard)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'center',
  width: '100%',
  padding: theme.spacing(4),
  gap: theme.spacing(2),
  margin: 'auto',
  [theme.breakpoints.up('sm')]: {
    maxWidth: '450px',
  },
  boxShadow:
    'hsla(220, 30%, 5%, 0.05) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.05) 0px 15px 35px -5px',
  ...theme.applyStyles('dark', {
    boxShadow:
      'hsla(220, 30%, 5%, 0.5) 0px 5px 15px 0px, hsla(220, 25%, 10%, 0.08) 0px 15px 35px -5px',
  }),
}));

const SignUpContainer = styled(Stack)(({ theme }) => ({
  height: 'calc((1 - var(--template-frame-height, 0)) * 100dvh)',
  minHeight: '100%',
  padding: theme.spacing(2),
  [theme.breakpoints.up('sm')]: {
    padding: theme.spacing(4),
  },
  '&::before': {
    content: '""',
    display: 'block',
    position: 'absolute',
    zIndex: -1,
    inset: 0,
    backgroundImage:
      'radial-gradient(ellipse at 50% 50%, hsl(210, 100%, 97%), hsl(0, 0%, 100%))',
    backgroundRepeat: 'no-repeat',
    ...theme.applyStyles('dark', {
      backgroundImage:
        'radial-gradient(at 50% 50%, hsla(210, 100%, 16%, 0.5), hsl(220, 30%, 5%))',
    }),
  },
}));

const Register = (props) => {
  const { registerType } = useContext(RegisterContext);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    ...(registerType === 'band' && { bandName: '', genre: '' }),
    ...(registerType === 'label' && { labelName: '', website: '' }),
  });
  const [error, setError] = useState('');
  
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [openPolicy, setOpenPolicy] = useState(false);
  
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validación de términos
    if (!acceptedTerms) {
      setError('Debes aceptar la política de privacidad y retención de datos para continuar.');
      return;
    }

    // Validación del correo electrónico con regex
    const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
    if (!emailRegex.test(formData.email)) {
      setError('El correo electrónico es inválido');
      return;
    }

    try {
      await register(formData);
      navigate('/login');
    } catch (err) {
      console.error('login error:', err);
      setError('Ya existe una cuenta asociada a este correo electrónico');
    }
  };

  return (
    <AppTheme {...props}>
      <CssBaseline enableColorScheme />
      <SignUpContainer direction="column" justifyContent="space-between">
        <Card variant="outlined">
          <Typography
            component="h1"
            variant="h4"
            sx={{ width: '100%', fontSize: 'clamp(2rem, 10vw, 2.15rem)' }}
          >
            Regístrate como {registerType.charAt(0).toUpperCase() + registerType.slice(1)}
          </Typography>
          {error && <Alert severity="error">{error}</Alert>}
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{
              display: 'flex',
              flexDirection: 'column',
              width: '100%',
              gap: 2,
            }}
          >
            {/* ...existing code... (Inputs de username, email, password, etc.) */}
            <FormControl>
              <FormLabel htmlFor="username">Nombre de Usuario</FormLabel>
              <TextField
                id="username"
                type="text"
                name="username"
                placeholder="Username"
                required
                fullWidth
                variant="outlined"
                value={formData.username}
                onChange={handleChange}
              />
            </FormControl>
            <FormControl>
              <FormLabel htmlFor="email">Correo electrónico</FormLabel>
              <TextField
                id="email"
                type="email"
                name="email"
                placeholder="tu@email.com"
                autoComplete="email"
                required
                fullWidth
                variant="outlined"
                value={formData.email}
                onChange={handleChange}
              />
            </FormControl>
            <FormControl>
              <FormLabel htmlFor="password">Contraseña</FormLabel>
              <TextField
                name="password"
                placeholder="••••••"
                type="password"
                id="password"
                autoComplete="current-password"
                required
                fullWidth
                variant="outlined"
                value={formData.password}
                onChange={handleChange}
              />
            </FormControl>
            {registerType === 'band' && (
              <>
                <FormControl>
                  <FormLabel htmlFor="bandName">Nombre de banda</FormLabel>
                  <TextField
                    id="bandName"
                    type="text"
                    name="bandName"
                    placeholder="Nombre de banda"
                    required
                    fullWidth
                    variant="outlined"
                    value={formData.bandName}
                    onChange={handleChange}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel htmlFor="genre">Género</FormLabel>
                  <TextField
                    id="genre"
                    type="text"
                    name="genre"
                    placeholder="Género"
                    required
                    fullWidth
                    variant="outlined"
                    value={formData.genre}
                    onChange={handleChange}
                  />
                </FormControl>
              </>
            )}
            {registerType === 'label' && (
              <>
                <FormControl>
                  <FormLabel htmlFor="labelName">Nombre del sello</FormLabel>
                  <TextField
                    id="labelName"
                    type="text"
                    name="labelName"
                    placeholder="Nombre del Sello"
                    required
                    fullWidth
                    variant="outlined"
                    value={formData.labelName}
                    onChange={handleChange}
                  />
                </FormControl>
                <FormControl>
                  <FormLabel htmlFor="website">Página Web</FormLabel>
                  <TextField
                    id="website"
                    type="text"
                    name="website"
                    placeholder="Sitio Web"
                    required
                    fullWidth
                    variant="outlined"
                    value={formData.website}
                    onChange={handleChange}
                  />
                </FormControl>
              </>
            )}

            {/* NUEVO: Checkbox de Políticas */}
            <FormControlLabel
              control={
                <Checkbox
                  value="allowExtraEmails"
                  color="primary"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                />
              }
              label={
                <Typography variant="body2" color="text.secondary">
                  Acepto la{' '}
                  <Link
                    component="button"
                    type="button"
                    variant="body2"
                    onClick={() => setOpenPolicy(true)}
                    sx={{ verticalAlign: 'baseline' }}
                  >
                    política de privacidad y retención de datos
                  </Link>
                  .
                </Typography>
              }
            />

            <Button type="submit" fullWidth variant="contained">
              Registrarse
            </Button>
          </Box>
        </Card>

        {/* NUEVO: Modal de Política de Privacidad */}
        <Dialog
          open={openPolicy}
          onClose={() => setOpenPolicy(false)}
          aria-labelledby="alert-dialog-title"
          aria-describedby="alert-dialog-description"
        >
          <DialogTitle id="alert-dialog-title">
            {"Política de Privacidad y Retención de Datos"}
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="alert-dialog-description" sx={{ mb: 2 }}>
              <strong>1. Recopilación de Datos:</strong> Recopilamos su nombre de usuario, correo electrónico y datos de perfil para gestionar su cuenta y mejorar su experiencia en Undersounds.
            </DialogContentText>
            <DialogContentText id="alert-dialog-description" sx={{ mb: 2 }}>
              <strong>2. Retención de Datos:</strong> Sus datos personales se conservarán mientras su cuenta permanezca activa. Si decide eliminar su cuenta, sus datos personales serán anonimizados o eliminados permanentemente de nuestros servidores en un plazo máximo de 30 días, salvo obligación legal de conservarlos.
            </DialogContentText>
            <DialogContentText id="alert-dialog-description">
              <strong>3. Derechos del Usuario:</strong> Usted tiene derecho a acceder, rectificar o solicitar la eliminación de sus datos en cualquier momento contactando con nuestro soporte.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenPolicy(false)} autoFocus>
              Entendido
            </Button>
          </DialogActions>
        </Dialog>

      </SignUpContainer>
    </AppTheme>
  );
};

export default Register;