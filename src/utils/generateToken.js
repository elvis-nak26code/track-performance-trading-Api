// Génère un token JWT signé pour un utilisateur donné. Centralisé ici pour
// que le format du token (payload, durée de vie) soit défini à un seul
// endroit et reste cohérent entre l'inscription, la connexion et la
// connexion Google.
const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * @param {import('mongoose').Document} user document Mongoose User
 * @returns {string} token JWT signé
 */
function generateToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

module.exports = { generateToken };
