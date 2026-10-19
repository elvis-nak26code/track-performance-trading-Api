// Script OPTIONNEL de nettoyage d'une base existante après la suppression du
// paiement : retire des utilisateurs les anciens champs de forfait et supprime
// la collection "subscriptions".
//
//   node scripts/cleanup-payment-data.js            -> aperçu, ne modifie RIEN
//   node scripts/cleanup-payment-data.js --confirm  -> applique le nettoyage
//
// Les trades, journaux, stratégies et comptes utilisateurs ne sont PAS touchés.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const CONFIRM = process.argv.includes('--confirm');
const OLD_FIELDS = ['plan', 'planStartedAt', 'promoCodesRedeemed', 'expiryReminderSentAt'];

(async () => {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI manquant dans .env');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  const db = mongoose.connection.db;
  console.log(`Base : ${mongoose.connection.name}`);

  const users = db.collection('users');
  const withOldFields = await users.countDocuments({ $or: OLD_FIELDS.map((f) => ({ [f]: { $exists: true } })) });
  const collections = (await db.listCollections({ name: 'subscriptions' }).toArray()).length;
  const subs = collections ? await db.collection('subscriptions').countDocuments() : 0;

  console.log(`Utilisateurs avec d'anciens champs de forfait : ${withOldFields}`);
  console.log(`Collection "subscriptions" : ${collections ? `${subs} document(s)` : 'absente'}`);

  if (!CONFIRM) {
    console.log('\nAperçu seulement. Relancez avec --confirm pour appliquer.');
  } else {
    const unset = Object.fromEntries(OLD_FIELDS.map((f) => [f, '']));
    const r = await users.updateMany({}, { $unset: unset });
    console.log(`\n✔ ${r.modifiedCount} utilisateur(s) nettoyé(s).`);
    if (collections) {
      await db.collection('subscriptions').drop();
      console.log('✔ Collection "subscriptions" supprimée.');
    }
  }
  await mongoose.disconnect();
})().catch((err) => {
  console.error('Erreur :', err.message);
  process.exit(1);
});
