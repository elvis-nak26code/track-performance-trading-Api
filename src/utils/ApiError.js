// Classe d'erreur personnalisée, utilisée dans toute l'application pour
// remonter des erreurs "métier" (ex: 404, 401, 400 de validation) avec un
// code HTTP explicite. Le middleware error.middleware.js s'appuie dessus
// pour construire une réponse JSON cohérente.
class ApiError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.statusCode = statusCode;
    this.code = code || null; // code métier optionnel (ex: 'PLAN_EXPIRED')
    this.isOperational = true; // erreur "attendue", pas un bug interne
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ApiError;
