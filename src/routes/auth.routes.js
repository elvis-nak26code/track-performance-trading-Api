// Routes d'authentification : /api/auth/...
// Un rate-limit est appliqué spécifiquement ici pour ralentir les tentatives
// de bruteforce sur /login, sans pénaliser le reste de l'API.
const express = require('express');
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { register, login, googleLogin } = require('../controllers/auth.controller');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: env.authRateLimitWindowMinutes * 60 * 1000,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Trop de tentatives. Réessayez plus tard.' },
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/google', authLimiter, googleLogin);

module.exports = router;
