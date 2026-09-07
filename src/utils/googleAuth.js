// Vérifie le jeton (credential) renvoyé par Google Identity Services côté
// frontend. Contrairement à un simple décodage du JWT, ceci valide la
// signature ET l'audience (GOOGLE_CLIENT_ID), garantissant que le jeton a
// bien été émis par Google pour CETTE application.
const { OAuth2Client } = require('google-auth-library');
const env = require('../config/env');
const ApiError = require('./ApiError');

const client = env.googleClientId ? new OAuth2Client(env.googleClientId) : null;

/**
 * @param {string} credential jeton JWT renvoyé par le bouton Google Login du frontend
 * @returns {Promise<{email: string, name: string, picture: string, googleId: string}>}
 */
async function verifyGoogleCredential(credential) {
  if (!client) {
    throw new ApiError(500, "GOOGLE_CLIENT_ID n'est pas configuré côté backend.");
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken: credential,
      audience: env.googleClientId,
    });
  } catch (error) {
    throw new ApiError(401, 'Jeton Google invalide ou expiré.');
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.email) {
    throw new ApiError(401, 'Impossible de lire les informations du compte Google.');
  }

  return {
    email: payload.email,
    name: payload.name || payload.email,
    picture: payload.picture || null,
    googleId: payload.sub,
  };
}

module.exports = { verifyGoogleCredential };
