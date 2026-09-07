// Point d'entrée du serveur : connecte la base de données puis démarre
// l'écoute HTTP. C'est ce fichier que "npm run dev" (nodemon) et
// "npm start" exécutent.
const app = require('./app');
const env = require('./config/env');
const { connectDatabase } = require('./config/database');

async function start() {
  await connectDatabase();

  const server = app.listen(env.port, () => {
    console.log(`[serveur] Journal de Trading API démarrée sur le port ${env.port} (${env.nodeEnv}).`);
    console.log(`[serveur] CORS autorisé pour : ${env.frontendUrl}`);
  });

  // Arrêt propre (ex: redéploiement) : on laisse les requêtes en cours se
  // terminer avant de couper le process.
  const shutdown = (signal) => {
    console.log(`[serveur] Signal ${signal} reçu, arrêt en cours...`);
    server.close(() => {
      console.log('[serveur] Arrêté proprement.');
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((error) => {
  console.error('[serveur] Échec du démarrage :', error);
  process.exit(1);
});
