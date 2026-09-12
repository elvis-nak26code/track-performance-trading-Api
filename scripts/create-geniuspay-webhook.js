// Script utilitaire (GENIUS PAY — mode sandbox) :
// crée le webhook marchand et affiche le secret `whsec_...` à coller dans
// API/.env (GENIUS_PAY_WEBHOOK_SECRET). Le secret n'est renvoyé qu'à la
// création : conservez-le précieusement.
//
// Usage :
//   node scripts/create-geniuspay-webhook.js
//
// Variables utilisées (depuis API/.env) :
//   GENIUS_PAY_API_KEY     -> en-tête X-API-Key
//   GENIUS_PAY_API_SECRET  -> en-tête X-API-Secret
//   GENIUS_PAY_BASE_URL    -> URL de base de l'API Marchand
//   GENIUS_PAY_WEBHOOK_URL -> URL publique qui recevra les notifications
//                             (défaut http://localhost:5000/api/subscriptions/webhook)
//
// IMPORTANT : pour un test de bout en bout, le backend doit être joignable
// depuis Internet (tunnel ngrok/cloudflared, ou serveur exposé) car c'est
// Genius Pay qui appelle cette URL. En développement local, configurez le
// tunnel d'abord puis passez sa URL en GENIUS_PAY_WEBHOOK_URL.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const baseUrl = (process.env.GENIUS_PAY_BASE_URL || 'https://geniuspay.ci/api/v1/merchant').replace(/\/+$/, '');
const apiKey = process.env.GENIUS_PAY_API_KEY || '';
const apiSecret = process.env.GENIUS_PAY_API_SECRET || '';
const webhookUrl =
  process.env.GENIUS_PAY_WEBHOOK_URL || 'http://localhost:5000/api/subscriptions/webhook';

const EVENTS = [
  'payment.success',
  'payment.failed',
  'payment.initiated',
  'payment.cancelled',
  'payment.refunded',
];

(async () => {
  if (!apiKey || !apiSecret) {
    console.error('Renseignez GENIUS_PAY_API_KEY et GENIUS_PAY_API_SECRET dans API/.env (clés sandbox).');
    process.exit(1);
  }

  console.log(`Création du webhook Genius Pay vers : ${webhookUrl}`);
  const response = await fetch(`${baseUrl}/webhooks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
      'X-API-Secret': apiSecret,
    },
    body: JSON.stringify({
      name: 'BlackTracker',
      url: webhookUrl,
      events: EVENTS,
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(`Erreur Genius Pay (${response.status}) :`, body.message || body.detail || JSON.stringify(body));
    process.exit(1);
  }

  const data = body.data || body;
  console.log('\n✔ Webhook créé !');
  console.log('\nCopiez cette ligne dans API/.env :');
  console.log(`GENIUS_PAY_WEBHOOK_SECRET=${data.secret || ''}`);
  console.log('\nID webhook :', data.id || '');
  console.log('⚠️  Le secret n\'est affiché qu\'une seule fois — conservez-le en sécurité.');
})().catch((err) => {
  console.error('Erreur :', err.message);
  process.exit(1);
});