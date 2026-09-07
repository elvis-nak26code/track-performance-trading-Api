// Connexion à MongoDB via Mongoose. Isolé dans son propre module pour que
// server.js reste lisible et pour pouvoir réutiliser cette fonction dans des
// scripts (ex: seedMarkets.js) sans dupliquer la logique de connexion.
const mongoose = require('mongoose');
const env = require('./env');

// Options recommandées pour limiter le temps d'attente en cas de mauvaise
// configuration réseau (évite que le serveur reste bloqué indéfiniment).
const MONGOOSE_OPTIONS = {
  serverSelectionTimeoutMS: 8000,
};

async function connectDatabase() {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(env.mongodbUri, MONGOOSE_OPTIONS);
    console.log(`[mongodb] Connecté à la base de données (${mongoose.connection.name}).`);
  } catch (error) {
    console.error('[mongodb] Échec de connexion :', error.message);
    // Sans base de données, l'API ne peut rien faire d'utile : on arrête le
    // process proprement plutôt que de démarrer un serveur qui échouerait
    // sur chaque requête.
    process.exit(1);
  }

  mongoose.connection.on('disconnected', () => {
    console.warn('[mongodb] Connexion perdue.');
  });
}

module.exports = { connectDatabase };
