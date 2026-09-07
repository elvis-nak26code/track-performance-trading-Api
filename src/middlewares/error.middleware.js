// Middlewares d'erreurs centralisés : un pour les routes inexistantes (404),
// un pour formatter toute erreur (ApiError ou erreur inattendue) en réponse
// JSON cohérente. C'est le DERNIER middleware branché dans app.js.
const env = require('../config/env');

function notFound(req, _res, next) {
  const ApiError = require('../utils/ApiError');
  next(new ApiError(404, `Route introuvable : ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;

  // Traduit quelques erreurs Mongoose fréquentes en messages plus lisibles.
  let message = err.message || 'Erreur interne du serveur.';
  if (err.name === 'ValidationError') {
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(' ');
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'champ';
    message = `Cette valeur pour "${field}" est déjà utilisée.`;
  }
  if (err.name === 'CastError') {
    message = 'Identifiant invalide.';
  }

  if (!err.isOperational && statusCode === 500) {
    // Erreur non anticipée : on la log côté serveur pour le débogage, mais on
    // ne renvoie jamais la stack trace brute au client en production.
    console.error('[erreur non gérée]', err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(env.isProduction ? {} : { stack: err.stack }),
  });
}

module.exports = { notFound, errorHandler };
