// Script exécuté une seule fois (ou à chaque déploiement si besoin) pour
// peupler la collection "markets" avec le catalogue de référence, identique
// aux données mockées du frontend. Usage : npm run seed:markets
const { connectDatabase } = require('../config/database');
const Market = require('../models/Market');
const seedData = require('../data/markets.seed.json');

async function seedMarkets() {
  await connectDatabase();

  let created = 0;
  let skipped = 0;

  for (const market of seedData) {
    const exists = await Market.findOne({ symbol: market.symbol.toUpperCase() });
    if (exists) {
      skipped += 1;
      continue;
    }
    await Market.create({ ...market, isCustom: false });
    created += 1;
  }

  console.log(`[seed:markets] ${created} marché(s) créé(s), ${skipped} déjà présent(s) (ignorés).`);
  process.exit(0);
}

seedMarkets().catch((error) => {
  console.error('[seed:markets] Échec :', error);
  process.exit(1);
});
