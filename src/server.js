// Point d'entrée du serveur : connecte la base de données puis démarre
// l'écoute HTTP. C'est ce fichier que "npm run dev" (nodemon) et
// "npm start" exécutent.
const app = require('./app');
const env = require('./config/env');
const { connectDatabase } = require('./config/database');
const Market = require('./models/Market');
const marketsSeed = require('./data/markets.seed.json');
const { runExpiryReminders } = require('./jobs/expiryReminder');

// Cadence du job de rappel d'expiration (6 h). Le job se ré-exécute via
// setInterval ; chaque passage est protégé contre les chevauchements.
const EXPIRY_REMINDER_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Pré-remplit la collection "markets" avec le catalogue de référence au
// démarrage, uniquement si elle est vide (la page /marches est alors
// utilisable sans passer par le script manuel seed:markets).
async function seedMarketsIfEmpty() {
  const count = await Market.estimatedDocumentCount();
  if (count > 0) {
    console.log(`[seed:markets] ${count} marché(s) déjà présent(s), pré-remplissage ignoré.`);
    return;
  }

  await Market.insertMany(
    marketsSeed.map((market) => ({ ...market, isCustom: false }))
  );
  console.log(`[seed:markets] ${marketsSeed.length} marché(s) de référence créé(s) au démarrage.`);
}

async function start() {
  await connectDatabase();
  await seedMarketsIfEmpty();

  const server = app.listen(env.port, () => {
    console.log(`[serveur] Journal de Trading API démarrée sur le port ${env.port} (${env.nodeEnv}).`);
    console.log(`[serveur] CORS autorisé pour : ${env.frontendUrl}`);
  });

  // Reminders d'expiration : premier passage différé (15 s, laisse la DB
  // chauffer) puis toutes les 6 h. Inoffensif sans SMTP configuré (no-op).
  setTimeout(runExpiryReminders, 15_000);
  setInterval(runExpiryReminders, EXPIRY_REMINDER_INTERVAL_MS);

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
