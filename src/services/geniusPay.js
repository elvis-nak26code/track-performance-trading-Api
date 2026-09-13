// Service d'intégration du prestataire de paiement Genius Pay.
//
// Documentation officielle (mode Marchand) :
//   Base URL  : https://geniuspay.ci/api/v1/merchant
//   Auth      : en-têtes `X-API-Key` (clé publique) et `X-API-Secret` (clé secrète)
//   Créer     : POST /payments  ->  { data: { reference, checkout_url, ... } }
//   Webhook   : signature HMAC-SHA256 sur timestamp + "." + corps brut, dans
//               l'en-tête `X-Webhook-Signature` (+ `X-Webhook-Timestamp`,
//               `X-Webhook-Event`, `X-Webhook-Environment`).
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

/** Le service n'est actif que si les deux clés API sont renseignées. */
function isConfigured() {
  return Boolean(env.geniusPay.apiKey && env.geniusPay.apiSecret && CONFIG.baseUrl);
}

function toCurrencyAmount(amountUsd) {
  // ⚠️ TEMPORAIRE (test réel) : force le montant minimum Genius Pay (200 XOF)
  // pour permettre d'effectuer un paiement réel à faible coût.
  // TODO: RETIRER après le test — revenir à Math.round(amountUsd * USD_TO_XOF_RATE).
  return 200;
}

function buildError(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

/**
 * Crée une demande de paiement côté Genius Pay et renvoie l'URL de checkout
 * à laquelle rediriger le navigateur de l'utilisateur.
 *
 * @param {object} opts
 * @param {number} opts.amountUsd montant en dollars américains
 * @param {string} opts.currency devise ('XOF' par défaut)
 * @param {string} opts.description libellé lisible par l'utilisateur
 * @param {string} opts.externalId référence unique côté application (checkoutRef)
 * @param {string} opts.returnUrl URL de retour après paiement réussi (success_url)
 * @param {string} opts.cancelUrl URL de retour après échec/annulation (error_url)
 * @param {{email?: string, name?: string}} opts.customer client
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

  const payload = {
    amount: toCurrencyAmount(opts.amountUsd),
    // Devises acceptées par Genius Pay : XOF, EUR, USD.
    currency: opts.currency || 'XOF',
    description: opts.description,
    // Omission de `payment_method` => page de checkout Genius Pay hébergée
    // (le client choisit son moyen de paiement). Approche recommandée.
    customer: {
      name: opts.customer?.name || '',
      email: opts.customer?.email || '',
    },
    // Genius Pay renvoie ces données telles quelles dans les webhooks : c'est
    // via checkout_ref qu'on retrouvera la subscription "pending".
    success_url: opts.returnUrl,
    error_url: opts.cancelUrl,
    metadata: {
      checkout_ref: opts.externalId,
    },
  };

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

module.exports = { isConfigured, createCheckout, verifyWebhookSignature, toCurrencyAmount };