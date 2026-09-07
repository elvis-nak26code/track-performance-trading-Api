// Charge et valide les variables d'environnement une seule fois, au
// démarrage de l'application. Centraliser cette logique ici évite de
// dupliquer "process.env.XXX" partout dans le code et permet de détecter
// immédiatement une configuration manquante au lancement du serveur.
require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    // En développement, on préfère un message clair plutôt qu'un crash
    // silencieux plus tard (ex: connexion Mongo qui échoue sans explication).
    throw new Error(`Variable d'environnement manquante : ${name}. Vérifiez votre fichier .env.`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 5000,
  frontendUrl: required('FRONTEND_URL', 'http://localhost:5173'),

  mongodbUri: required('MONGODB_URI'),

  jwtSecret: required('JWT_SECRET'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',

  googleClientId: process.env.GOOGLE_CLIENT_ID || '',

  authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
  authRateLimitWindowMinutes: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES) || 15,

  // Réservé à l'intégration future de Genius Pay (non utilisé pour l'instant).
  geniusPay: {
    apiKey: process.env.GENIUS_PAY_API_KEY || '',
    baseUrl: process.env.GENIUS_PAY_BASE_URL || '',
    webhookSecret: process.env.GENIUS_PAY_WEBHOOK_SECRET || '',
  },

  isProduction: (process.env.NODE_ENV || 'development') === 'production',
};

module.exports = env;
