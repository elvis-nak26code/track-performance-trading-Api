// Point d'entrée du serveur : connecte la base de données puis démarre
// l'écoute HTTP. C'est ce fichier que "npm run dev" (nodemon) et
// "npm start" exécutent.
const app = require('./app');
const env = require('./config/env');
const { connectDatabase } = require('./config/database');
const Market = require('./models/Market');
const marketsSeed = require('./data/markets.seed.json');

// Pré-remplit la collection "markets" avec le catalogue de référence au
// démarrage. Compatible avec une collection déjà peuplée : seuls les
// actifs prédéfinis manquants sont ajoutés (fusion par symbole), les
// ajouts manuels des utilisateurs (isCustom: true) sont préservés. La page
// /marches est ainsi toujours utilisable sans passer par seed:markets.
async function seedMarketsIfEmpty() {
  const count = await Market.estimatedDocumentCount();
  // Seuls les marchés de RÉFÉRENCE comptent ici : les marchés personnalisés
  // d'un utilisateur ne doivent pas empêcher l'ajout d'un actif de référence.
  const existingSymbols = new Set(
    (await Market.find({ isCustom: false }, { symbol: 1 })).map((m) => m.symbol.toUpperCase())
  );

  const missing = marketsSeed.filter(
    (market) => !existingSymbols.has(market.symbol.toUpperCase())
  );

  if (missing.length === 0) {
    console.log(`[seed:markets] ${count} marché(s) déjà présents, catalogue à jour.`);
    return;
  }

  await Market.insertMany(missing.map((market) => ({ ...market, isCustom: false })));
  console.log(
    `[seed:markets] ${count} marché(s) présent(s), ${missing.length} nouveau(x) actif(s) de référence ajouté(s).`
  );
}

async function start() {
  await connectDatabase();
  // Aligne les index de la collection "markets" sur le schéma (l'ancien index
  // unique global sur "symbol" est remplacé par un index unique par propriétaire,
  // pour que les marchés personnalisés d'un utilisateur restent privés).
  await Market.syncIndexes();
  await seedMarketsIfEmpty();

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
