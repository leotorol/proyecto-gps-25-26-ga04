const express = require('express');
const router = express.Router();
const passport = require('passport');
const AccountController = require('../controller/AccountController');
const AccountDTO = require('../model/dto/AccountDTO');
const { authLimiter, otpLimiter } = require('../middleware/rateLimit');

router.post('/register', authLimiter, AccountController.register);
router.post('/login', authLimiter, AccountController.login);
router.put('/:id', AccountController.updateProfile);
router.post('/logout', AccountController.logout);
router.post('/refresh-token', AccountController.refreshToken);
router.post('/toggle-follow', passport.authenticate('jwt', { session: false }), AccountController.toggleFollow);
router.post('/toggle-like', passport.authenticate('jwt', { session: false }), AccountController.toggleLike);

// Nuevas rutas de recuperación de contraseña
router.post('/forgot-password', otpLimiter, AccountController.forgotPassword);
router.post('/reset-password', otpLimiter, AccountController.resetPassword);

// Rutas para OAuth con Google
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: 'http://localhost:3000/login' }),
  (req, res) => {
    // Generar un token JWT para mantener la sesión en el frontend
    const token = AccountController.generateToken(req.user);
    
    // Redirige a la HomePage del frontend con el token
    res.redirect(`http://localhost:3000/?token=${token}`);
  }
);

router.get('/me', passport.authenticate('jwt', { session: false }), (req, res) => {  
  // Devolver la información del usuario
  res.json({ account: new AccountDTO(req.user) });
});
module.exports = router;