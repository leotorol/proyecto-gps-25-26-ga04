const AccountDao = require('../model/dao/AccountDAO');
const AccountDTO = require('../model/dto/AccountDTO');
const AccountFactory = require('../model/factory/AccountFactory');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const axios = require('axios');
const { withRetry } = require('../utils/httpRetry');
const logger = require('../utils/logger');

const CONTENT_SERVICE_URL = process.env.CONTENT_SERVICE_URL || 'http://localhost:5001/api';
const SERVICE_API_KEY = process.env.SERVICE_API_KEY || '';

// nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Función para generar un OTP aleatorio de 6 caracteres alfanuméricos
function generateOtp() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let otp = '';
  for (let i = 0; i < 6; i++) {
    otp += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return otp;
}

// Función para enviar el correo real con el OTP
async function sendOtpEmail(email, otp) {
  const mailOptions = {
    from: process.env.FROM_EMAIL,
    to: email,
    subject: 'Código de recuperación de contraseña',
    text: `Tu código OTP es: ${otp}`,
    html: `<p>Tu código OTP es: <strong>${otp}</strong></p>`
  };

  await transporter.sendMail(mailOptions);
}

// Helpers para comunicación con content-service
async function createArtistRemote(artistPayload) {
  return withRetry(async () => {
    const resp = await axios.post(
      `${CONTENT_SERVICE_URL}/artists`,
      artistPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(SERVICE_API_KEY && { 'x-service-api-key': SERVICE_API_KEY })
        },
        timeout: 10000
      }
    );
    return resp.data?.artista || resp.data?.artist || resp.data;
  }, 3, 1000); // 3 intentos, 1s base delay
}

async function fetchArtistRemoteById(artistId) {
  try {
    return await withRetry(async () => {
      const resp = await axios.get(`${CONTENT_SERVICE_URL}/artists/${artistId}`, {
        headers: {
          ...(SERVICE_API_KEY && { 'x-service-api-key': SERVICE_API_KEY })
        },
        timeout: 8000
      });
      return resp.data?.artista || resp.data?.artist || resp.data;
    }, 3, 1000);
  } catch (err) {
    logger.warn({ err: err.message, artistId }, 'fetchArtistRemoteById failed');
    return null;
  }
}

class AccountController {

  async register(req, res) {
    try {
      const inputData = req.body;
      // Comprueba si el correo ya existe
      const existingAccount = await AccountDao.findByEmail(inputData.email);
      if (existingAccount) {
        return res.status(400).json({ error: 'El correo electrónico ya está en uso' });
      }

      inputData.profileImage = `https://ui-avatars.com/api/?name=${encodeURIComponent(inputData.username)}&size=128&background=random&color=fff`;
      const accountData = AccountFactory.createAccount(inputData);
      accountData.password = await bcrypt.hash(accountData.password, 10);

      // Crear la cuenta primero (sin artistId)
      const newAccount = await AccountDao.create(accountData);

      // Si es una banda, intentar crear el artista remoto y luego vincular
      if (newAccount.role === 'band') {
        try {
          const artistPayload = {
            name: newAccount.bandName || newAccount.username,
            profileImage: newAccount.profileImage || '',
            banner: newAccount.bannerImage || '',
            genre: newAccount.genre || '',
            bio: newAccount.bio || '',
            seguidores: newAccount.followers || 0,
            albums: []
          };

          const createdArtist = await createArtistRemote(artistPayload);
          const newArtistId = createdArtist?._id || createdArtist?.id || createdArtist?.id;

          if (newArtistId) {
            // Vincular en la cuenta
            try {
              await AccountDao.linkToArtist(newAccount._id, newArtistId);
              const updatedAccount = await AccountDao.findById(newAccount._id);
              return res.status(201).json(new AccountDTO(updatedAccount));
            } catch (error_) {
              logger.error({ err: error_, accountId: newAccount._id }, 'Error vinculando artistId');
              return res.status(201).json(new AccountDTO(newAccount));
            }
          } else {
            logger.warn({ createdArtist }, 'Artist creado sin ID');
            return res.status(201).json(new AccountDTO(newAccount));
          }
        } catch (error_) {
          logger.error({ err: error_.message }, 'Error creando artista remoto');
          return res.status(201).json(new AccountDTO(newAccount));
        }
      }

      // No es banda: devolver la cuenta creada
      return res.status(201).json(new AccountDTO(newAccount));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async login(req, res) {
    try {
      const { email, password } = req.body;
      const account = await AccountDao.findByEmail(email);
      if (!account) return res.status(401).json({ error: 'Credenciales inválidas' });
      const valid = await bcrypt.compare(password, account.password);
      if (!valid) return res.status(401).json({ error: 'Credenciales inválidas' });

      // Si es una banda y tiene artistId, cargar datos completos desde content-service
      let accountToReturn = account;
      if (account.role === 'band' && account.artistId) {
        try {
          const artistRemote = await fetchArtistRemoteById(account.artistId);
          if (artistRemote) {
            // Crear una copia ligera del account y adjuntar artist
            const accountPlain = account.toObject ? account.toObject() : { ...account };
            accountPlain.artist = artistRemote;
            accountToReturn = accountPlain;
          } // si no hay artistRemote, devolvemos account sin artist
        } catch (err) {
          logger.warn({ err: err.message, artistId: account.artistId }, 'Error obteniendo artista en login');
          accountToReturn = account;
        }
      }

      // Genera el access token y el refresh token
      const accessToken = jwt.sign(
        { id: account._id },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: '15m' }
      );
      const refreshToken = jwt.sign(
        { id: account._id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: '7d' }
      );

      // Envía el refresh token en cookie HttpOnly
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Lax',
        ...(req.body.remember ? { maxAge: 7 * 24 * 60 * 60 * 1000 } : {}) // Si remember es false, la cookie será de sesión
      });

      // Envía el access token y la cuenta en el body
      res.json({
        account: new AccountDTO(accountToReturn),
        accessToken
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async refreshToken(req, res) {
    try {
      // Lee el refresh token desde la cookie
      const token = req.cookies.refreshToken;
      if (!token) return res.status(401).json({ error: 'No se proporcionó refresh token' });

      jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, async (err, decoded) => {
        if (err) return res.status(401).json({ error: 'Refresh token no válido' });
        // Genera un nuevo access token
        const newAccessToken = jwt.sign(
          { id: decoded.id },
          process.env.ACCESS_TOKEN_SECRET,
          { expiresIn: '15m' }
        );
        // Obtén la cuenta existente en la base de datos
        const account = await AccountDao.findById(decoded.id);
        if (!account) return res.status(404).json({ error: 'Cuenta no encontrada' });

        // Si es una banda con artistId, cargar datos completos desde content-service
        let accountToReturn = account;
        if (account.role === 'band' && account.artistId) {
          try {
            const artistRemote = await fetchArtistRemoteById(account.artistId);
            if (artistRemote) {
              const accountPlain = account.toObject ? account.toObject() : { ...account };
              accountPlain.artist = artistRemote;
              accountToReturn = accountPlain;
            }
          } catch (err) {
            logger.warn({ err: err.message, artistId: account.artistId }, 'Error obteniendo artista en refreshToken');
            accountToReturn = account;
          }
        }

        res.json({
          accessToken: newAccessToken,
          account: new AccountDTO(accountToReturn)
        });
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Nuevo método para generar token (usado en autenticación OAuth)
  generateToken(user) {
    if (!user) {
      throw new Error('Usuario no válido para generar token');
    }

    // Genera el access token usando la misma estructura y secreto que el método login
    const accessToken = jwt.sign(
      {
        id: user._id || user.id,
        email: user.email
      },
      process.env.ACCESS_TOKEN_SECRET,
      { expiresIn: '1d' } // Token válido por 1 día
    );

    return accessToken;
  }

  async getAccountType(req, res) {
    try {
      const { id } = req.params;
      const account = await AccountDao.findById(id);
      if (!account) {
        return res.status(404).json({ error: 'Cuenta no encontrada' });
      }
      res.json({ type: account.type });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async updateProfile(req, res) {
    try {
      const { id } = req.params;
      const updatedAccount = await AccountDao.update(id, req.body);
      // Retorna un objeto que incluya success y el dto actualizado
      res.json({ success: true, account: new AccountDTO(updatedAccount) });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  async logout(req, res) {
    // Borra la cookie del refresh token
    res.clearCookie('refreshToken');
    res.json({ success: true });
  }

  // Endpoint para solicitar recuperación de contraseña
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      const account = await AccountDao.findByEmail(email);
      if (!account) {
        return res.status(404).json({ error: 'Correo no encontrado' });
      }

      // Genera un nuevo OTP
      const otp = generateOtp();

      // Firma un token que contiene el OTP y el email con expiración de 10 minutos
      const otpToken = jwt.sign({ otp, email }, process.env.OTP_SECRET, { expiresIn: '10m' });

      // Envía el OTP por correo de forma asíncrona
      sendOtpEmail(email, otp).catch(err => {
        logger.error({ err, email }, 'Error enviando OTP');
      });

      // Responde inmediatamente y envía también el otpToken para que el cliente lo guarde
      res.json({ message: 'Se ha enviado un código OTP a su correo', otpToken });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async resetPassword(req, res) {
    try {
      const { email, otp, newPassword, otpToken } = req.body;

      if (!otpToken) {
        return res.status(400).json({ error: 'No se ha proporcionado el otpToken' });
      }

      let decoded;
      try {
        decoded = jwt.verify(otpToken, process.env.OTP_SECRET);
      } catch (err) {
        logger.warn({ err: err.message, email }, 'OTP token inválido/expirado');
        return res.status(400).json({ error: 'Token OTP inválido o expirado' });
      }

      if (decoded.email !== email || decoded.otp !== otp) {
        return res.status(400).json({ error: 'OTP inválido' });
      }

      const account = await AccountDao.findByEmail(email);
      if (!account) {
        return res.status(404).json({ error: 'Correo no encontrado' });
      }

      account.password = await bcrypt.hash(newPassword, 10);

      await account.save();

      res.json({ message: 'Contraseña actualizada exitosamente' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Método para vincular una cuenta de banda existente a un artista (útil para migraciones)
  async linkBandToArtist(req, res) {
    try {
      const { accountId } = req.params;
      const account = await AccountDao.findById(accountId);

      if (!account) {
        return res.status(404).json({ error: 'Cuenta no encontrada' });
      }

      if (account.role !== 'band') {
        return res.status(400).json({ error: 'Solo se pueden vincular cuentas de tipo banda' });
      }

      if (account.artistId) {
        return res.status(400).json({ error: 'Esta cuenta ya está vinculada a un artista' });
      }

      const artistPayload = {
        name: account.bandName || account.username,
        profileImage: account.profileImage || '',
        banner: account.bannerImage || '',
        genre: account.genre || '',
        bio: account.bio || '',
        seguidores: account.followers || 0,
        albums: []
      };

      try {
        const createdArtist = await createArtistRemote(artistPayload);
        const newArtistId = createdArtist?._id || createdArtist?.id || createdArtist?.id;
        if (!newArtistId) {
          return res.status(500).json({ error: 'No se pudo obtener ID del artista remoto' });
        }
        const updatedAccount = await AccountDao.linkToArtist(accountId, newArtistId);
        return res.json({
          success: true,
          message: 'Cuenta vinculada correctamente con un nuevo artista',
          account: new AccountDTO(updatedAccount)
        });
      } catch (err) {
        logger.error({ err: err.message, accountId }, 'Error creando artista remoto');
        return res.status(500).json({ error: 'Error creando artista remoto' });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async toggleFollow(req, res) {
    try {
      const userId = req.user.id; // Viene del middleware de auth
      const { artistId } = req.body;
      
      const account = await AccountDao.findById(userId);
      const isFollowing = Boolean(account.following?.includes(String(artistId)));
      
      let updatedAccount;
      if (isFollowing) {
        updatedAccount = await AccountDao.unfollowArtist(userId, artistId);
      } else {
        updatedAccount = await AccountDao.followArtist(userId, artistId);
      }
      
      res.json({ 
        success: true, 
        following: !isFollowing, 
        list: updatedAccount.following 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async toggleLike(req, res) {
    try {
      const userId = req.user.id;
      const { trackId } = req.body;
      
      const account = await AccountDao.findById(userId);
      const isLiked = Boolean(account.likedTracks?.includes(String(trackId)));
      
      let updatedAccount;
      if (isLiked) {
        updatedAccount = await AccountDao.unlikeTrack(userId, trackId);
      } else {
        updatedAccount = await AccountDao.likeTrack(userId, trackId);
      }
      
      res.json({ 
        success: true, 
        liked: !isLiked, 
        list: updatedAccount.likedTracks 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new AccountController();