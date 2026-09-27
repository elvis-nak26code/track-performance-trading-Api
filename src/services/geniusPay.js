// Service d'intégration du prestataire de paiement Genius Pay.
//
// Documentation officielle (mode Marchand) :
//   Base URL  : https://pay.genius.ci/api/v1/merchant (l'ancien domaine
//               https://geniuspay.ci/api/v1/merchant répond toujours).
//   Auth      : en-têtes `X-API-Key` (clé publique) et `X-API-SECRET` (clé secrète)
//   Créer     : POST /payments  ->  { data: { reference, checkout_url | payment_url, ... } }
//   Webhook   : signature HMAC-SHA256 sur timestamp + "." + corps brut, dans
//               l'en-tête `X-Webhook-Signature` (+ `X-Webhook-Timestamp`,
//               `X-Webhook-Event`, `X-Webhook-Environment`).
//
// Mobile money — Burkina Faso (+226) : le mode agrégateur avec détection
// automatique par numéro (PawaPay) ne couvre PAS le BF. Pour un client
// burkinabè, deux voies fiables :
//   1. RECOMMANDÉ — ne pas préciser `payment_method` : la page de checkout
//      hébergée Genius Pay laisse le client choisir son opérateur.
//   2. Préciser explicitement `payment_method` : orange_money / mtn_money /
//      moov_money (ou wave / card), accompagné du téléphone et du pays.
// On ne déduit donc JAMAIS le moyen de paiement du numéro : `payment_method`
// n'est envoyé que si le client l'a explicitement choisi. Ces codes couvrent
// CI (+225) et BF (+226).
//
// En mode SANDBOX, seule la base URL et les clés changent (sk_sandbox_... /
// ss_sandbox_...). Le code d'intégration est identique en production.
//
// Tant que GENIUS_PAY_WEBHOOK_SECRET est vide, `verifyWebhookSignature`
// refuse tous les webhooks (sécurité). Le script
// `scripts/create-geniuspay-webhook.js` permet de créer le webhook une seule
// fois ; la valeur `whsec_...` renvoyée est à coller dans .env.
const crypto = require('crypto');
const env = require('../config/env');

const USD_TO_XOF_RATE = 600; // taux indicatif, identique à src/constants/plans.js (frontend)

const CONFIG = {
  baseUrl: (env.geniusPay.baseUrl || 'https://geniuspay.ci/api/v1/merchant').replace(/\/+$/, ''),
};

// Moyens de paiement directs supportés par Genius Pay pour CI (+225) ET BF (+226).
// (Voir tableau "Méthodes de paiement" de la doc officielle.)
const SUPPORTED_PAYMENT_METHODS = [
  'orange_money',
  'mtn_money',
  'wave',
  'moov_money',
  'card',
];

// Préfixes internationaux → pays ISO2, pour le routage PawaPay / la détection.
const PHONE_COUNTRY_PREFIXES = [
  ['+225', 'CI'], // Côte d'Ivoire
  ['+226', 'BF'], // Burkina Faso
  ['+221', 'SN'], // Sénégal
  ['+223', 'ML'], // Mali
  ['+229', 'BJ'], // Bénin
  ['+228', 'TG'], // Togo
  ['+227', 'NE'], // Niger
  ['+224', 'GN'], // Guinée
  ['+245', 'GW'], // Guinée-Bissau
  ['+232', 'SL'], // Sierra Leone
  ['+233', 'GH'], // Ghana
  ['+234', 'NG'], // Nigeria
  ['+237', 'CM'], // Cameroun
  ['+241', 'GA'], // Gabon
  ['+242', 'CG'], // République du Congo
  ['+243', 'CD'], // RD Congo
  ['+236', 'CF'], // Centrafrique
  ['+240', 'GQ'], // Guinée équatoriale
  ['+244', 'AO'], // Angola
  ['+254', 'KE'], // Kenya
  ['+256', 'UG'], // Ouganda
  ['+250', 'RW'], // Rwanda
  ['+260', 'ZM'], // Zambie
  ['+255', 'TZ'], // Tanzanie
  ['+258', 'MZ'], // Mozambique
  ['+257', 'BI'], // Burundi
];

/** Nettoie un numéro : ne conserve que les chiffres et le '+' initial. */
function sanitizePhone(input) {
  return String(input || '').trim().replace(/[^\d+]/g, '');
}

/** Déduit le pays (ISO2) d'un numéro international, ou null si inconnu. */
function detectCountryFromPhone(phone) {
  const p = sanitizePhone(phone);
  if (!p.startsWith('+')) return null;
  for (const [prefix, country] of PHONE_COUNTRY_PREFIXES) {
    if (p.startsWith(prefix)) return country;
  }
  return null;
}

/** Le service n'est actif que si les deux clés API sont renseignées. */
function isConfigured() {
  return Boolean(env.geniusPay.apiKey && env.geniusPay.apiSecret && CONFIG.baseUrl);
}

function toCurrencyAmount(amountUsd) {
  return Math.round(amountUsd * USD_TO_XOF_RATE);
}

function buildError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

/**
 * Crée une demande de paiement côté Genius Pay et renvoie l'URL vers laquelle
 * rediriger le navigateur de l'utilisateur.
 *
 * Pour le mobile money, il est recommandé de laisser le client choisir sur la
 * page de checkout hébergée (aucun `payment_method`) : c'est la voie fiable au
 * Burkina Faso, où la détection automatique par numéro ne fonctionne pas. Si un
 * `payment_method` explicite est fourni, le téléphone du client est nécessaire
 * pour recevoir le push USSD/SMS.
 *
 * @param {object} opts
 * @param {number} opts.amountUsd montant en dollars américains
 * @param {string} opts.currency devise ('XOF' par défaut)
 * @param {string} opts.description libellé lisible par l'utilisateur
 * @param {string} opts.externalId référence unique côté application (checkoutRef)
 * @param {string} opts.returnUrl URL de retour après paiement réussi (success_url)
 * @param {string} opts.cancelUrl URL de retour après échec/annulation (error_url)
 * @param {{email?: string, name?: string, phone?: string, country?: string}} opts.customer
 *        client ; `phone` en format international (+225...), `country` en ISO2.
 * @param {string} [opts.paymentMethod] moyen de paiement direct choisi par le
 *        client : 'orange_money', 'mtn_money', 'wave', 'moov_money', 'card'.
 *        Si absent, la page de checkout hébergée Genius Pay est utilisée
 *        (recommandé pour le Burkina Faso : le client y choisit son opérateur).
 * @param {string} [opts.gateway] gateway explicite (ex: 'orange_money')
 * @param {string} [opts.mmoProvider] code fournisseur PawaPay (réservé à
 *        payment_method='pawapay', non proposé ici).
 * @returns {Promise<{ payUrl: string, providerRef: string }>}
 */
async function createCheckout(opts) {
  if (!isConfigured()) {
    throw buildError(
      'Le module de paiement Genius Pay n\'est pas encore configuré. Renseignez GENIUS_PAY_API_KEY, GENIUS_PAY_API_SECRET et GENIUS_PAY_BASE_URL.',
      501,
      'PAYMENT_NOT_CONFIGURED'
    );
  }

  const customer = {
    name: opts.customer?.name || '',
    email: opts.customer?.email || '',
  };
  const phone = sanitizePhone(opts.customer?.phone);
  if (phone) customer.phone = phone;

  // Moyen de paiement : envoyé UNIQUEMENT si le client l'a explicitement choisi.
  // On ne le déduit pas du numéro (l'agrégateur auto par numéro ne couvre pas le
  // Burkina Faso) : sans choix explicite, Genius Pay affiche sa page de checkout
  // hébergée et le client y sélectionne son opérateur.
  let method = String(opts.paymentMethod || '').trim();
  let country = String(opts.customer?.country || '').trim().toUpperCase();
  if (phone) {
    country = detectCountryFromPhone(phone) || country || null;
  }
  if (country) customer.country = country;
  if (method && !SUPPORTED_PAYMENT_METHODS.includes(method)) {
    throw buildError(`Moyen de paiement non supporté par Genius Pay : ${method}`, 400, 'PAYMENT_METHOD_UNSUPPORTED');
  }

  const payload = {
    amount: toCurrencyAmount(opts.amountUsd),
    // Devises acceptées par Genius Pay : XOF, EUR, USD.
    currency: opts.currency || 'XOF',
    description: opts.description,
    // Omission de `payment_method` => page de checkout Genius Pay hébergée.
    // Avec `payment_method` (+ téléphone/pays), redirection directe vers le
    // gateway ciblé — c'est la voie fiable pour Orange Money / MTN / Moov.
    customer,
    // Genius Pay renvoie ces données telles quelles dans les webhooks : c'est
    // via checkout_ref qu'on retrouvera la subscription "pending".
    success_url: opts.returnUrl,
    error_url: opts.cancelUrl,
    metadata: {
      checkout_ref: opts.externalId,
    },
  };
  if (method) {
    payload.payment_method = method;
    if (opts.gateway) payload.gateway = String(opts.gateway).trim();
    if (opts.mmoProvider) payload.mmo_provider = String(opts.mmoProvider).trim();
  }

  let response;
  try {
    response = await fetch(`${CONFIG.baseUrl}/payments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.geniusPay.apiKey,
        'X-API-Secret': env.geniusPay.apiSecret,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw buildError(`Impossible de joindre Genius Pay : ${err.message}`, 502, 'GENIUSPAY_UNREACHABLE');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      data?.message || data?.detail || data?.error || data?.status || `Genius Pay a refusé le paiement (${response.status}).`;
    throw buildError(message, response.status, 'GENIUSPAY_API_ERROR');
  }

  const payment = data?.data || data;
  const payUrl = payment?.checkout_url || payment?.payment_url || payment?.url;
  if (!payUrl) {
    throw buildError('Genius Pay n\'a pas renvoyé d\'URL de checkout.', 502, 'GENIUSPAY_NO_CHECKOUT_URL');
  }

  return { payUrl, providerRef: payment?.reference || opts.externalId };
}

/**
 * Vérifie la signature HMAC-SHA256 d'un webhook Genius Pay.
 *
 * Formats acceptés (deux générations d'API rencontrées dans la doc officielle) :
 *   1. Doc actuelle : signature = HMAC(timestamp + "." + corps BRUT, secret),
 *      avec protection anti-rejeu (fenêtre de 5 min via X-Webhook-Timestamp).
 *   2. Format legacy (plugins GeniusPay) : signature = HMAC(corps BRUT, secret),
 *      en-tête éventuellement préfixé "sha256=".
 *
 * Sans secret configuré, refuse systématiquement (ne jamais accepter un
 * webhook non vérifié).
 *
 * @param {string} rawBody corps brut de la requête, tel que reçu
 * @param {object} headers en-têtes HTTP de la requête (req.headers)
 */
function verifyWebhookSignature(rawBody, headers = {}) {
  const secret = env.geniusPay.webhookSecret || '';
  if (!secret) return false;

  const signature = String(
    headers['x-webhook-signature'] ||
      headers['X-Webhook-Signature'] ||
      headers['x-geniuspay-signature'] ||
      headers['X-GeniusPay-Signature'] ||
      ''
  ).trim();
  const timestamp = String(
    headers['x-webhook-timestamp'] || headers['X-Webhook-Timestamp'] || ''
  ).trim();

  if (!signature) return false;

  // Normalise un éventuel préfixe "sha256=" (style Stripe) utilisé par les
  // anciens plugins GeniusPay.
  const cleanSignature = signature.replace(/^sha256=\s*/i, '').toLowerCase();

  // Stratégie 1 (doc actuelle) : timestamp + "." + corps brut + fenêtre 5 min.
  if (timestamp && Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) <= 300) {
    const expected = hmacSign(secret, `${timestamp}.${rawBody}`);
    if (safeEqualHex(expected, cleanSignature)) return true;

    // Variante : certains clients signent le JSON re-sérialisé (décodé puis
    // ré-encodé) plutôt que les octets reçus.
    try {
      const reserialized = JSON.stringify(JSON.parse(rawBody));
      if (reserialized !== rawBody && safeEqualHex(hmacSign(secret, `${timestamp}.${reserialized}`), cleanSignature)) {
        return true;
      }
    } catch (_err) {
      /* corps non-JSON : on ignore cette variante */
    }
  }

  // Stratégie 2 (legacy) : HMAC du corps brut seul, sans timestamp.
  if (safeEqualHex(hmacSign(secret, rawBody), cleanSignature)) {
    if (env.nodeEnv === 'development') {
      console.warn('[GeniusPay] Webhook validé au format legacy (sans timestamp) — à verrouiller en production.');
    }
    return true;
  }

  return false;
}

function hmacSign(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function safeEqualHex(a, b) {
  const bufA = Buffer.from(String(a), 'utf8');
  const bufB = Buffer.from(String(b), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = {
  isConfigured,
  createCheckout,
  verifyWebhookSignature,
  toCurrencyAmount,
  sanitizePhone,
  detectCountryFromPhone,
};