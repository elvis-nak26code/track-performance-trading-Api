// Charge et valide les variables d'environnement une seule fois, au
// démarrage de l'application. Centraliser cette logique ici évite de
// dupliquer "process.env.XXX" partout dans le code et permet de détecter
// immédiatement une configuration manquante au lancement du serveur.
require('dotenv').config();

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
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

  // E-mails transactionnels (SMTP). L'application fonctionne sans : tant que
  // EMAIL_ENABLED !== 'true' ou que le serveur est incomplet, les envois sont
  // des no-ops journalisés.
  email: {
    enabled: (process.env.EMAIL_ENABLED || 'false') === 'true',
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: (process.env.SMTP_SECURE || 'false') === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.EMAIL_FROM || '',
  },

  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY || '',
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET || '',

  isProduction: (process.env.NODE_ENV || 'development') === 'production',
};

module.exports = env;
