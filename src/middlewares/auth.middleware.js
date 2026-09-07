// Middleware de protection des routes : vérifie le token JWT envoyé dans
// l'en-tête "Authorization: Bearer <token>" et attache l'utilisateur
// correspondant à req.user pour que les contrôleurs suivants puissent
// filtrer les données par propriétaire (isolation des comptes).
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const User = require('../models/User');

const protect = asyncHandler(async (req, _res, next) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new ApiError(401, 'Authentification requise. Jeton manquant.');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret);
  } catch (error) {
    throw new ApiError(401, 'Jeton invalide ou expiré.');
  }

  const user = await User.findById(payload.sub);
  if (!user) {
    throw new ApiError(401, "Utilisateur introuvable pour ce jeton.");
  }

  req.user = user;
  next();
});

module.exports = { protect };
