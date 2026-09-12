// Contrôleur Subscription : expose les forfaits disponibles (/tarifs côté
// frontend) et gère le cycle de vie des abonnements.
//
// FLUX DE PAIEMENT (Genius Pay) :
//   1. L'utilisateur choisit un forfait PAYANT depuis /tarifs.
//   2. Le frontend appelle POST /subscriptions/checkout { planId }.
//   3. Le backend crée une entrée Subscription "pending" puis demande à
//      Genius Pay une URL de paiement (voir services/geniusPay.js), qu'il
//      renvoie au frontend.
//   4. Le frontend redirige le navigateur vers cette URL.
//   5. Genius Pay notifie le backend via POST /subscriptions/webhook : le
//      backend vérifie la signature, retrouve la subscription par référence,
//      passe son statut à "active" et active le forfait sur le compte.
//
// Si les clés Genius Pay ne sont pas configurées (voir .env), /checkout
// répond HTTP 501 (PAYMENT_NOT_CONFIGURED) : l'app fonctionne normalement,
// mais le paiement "réel" est indisponible — le forfait Essai reste activable.
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { isPlanExpired, getDaysRemaining, isLifetimePlan } = require('../middlewares/plan.middleware');
const { PLANS, getPlan, FREE_PLAN_ID } = require('../constants/plans');
const geniusPay = require('../services/geniusPay');
const emailService = require('../services/emailService');
const env = require('../config/env');
const fs = require('fs');
const path = require('path');

// Référence unique interne pour retrouver une subscription au retour du webhook.
function generateCheckoutRef() {
  return `JT-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

// Active un forfait sur le compte (plan + date de début), réinitialise le
// marqueur de rappel d'expiration et journalise l'historique Subscription.
async function applyPlanToUser(user, plan, { provider = 'none', providerReference = null, amountUsd = 0, rawPayload = null } = {}) {
  user.plan = plan.id;
  user.planStartedAt = new Date();
  user.expiryReminderSentAt = null; // nouveau cycle = nouveau rappel possible
  await user.save();

  await Subscription.create({
    user: user._id,
    planId: plan.id,
    status: 'active',
    startedAt: user.planStartedAt,
    amountUsd,
    provider,
    providerReference,
    rawProviderPayload: rawPayload,
  });

  // Confirmation par e-mail (no-op si SMTP non configuré).
  emailService.sendSubscriptionConfirmationEmail(user, plan, providerToSource(provider)).catch(() => {});
  return user;
}

function providerToSource(provider) {
  if (provider === 'promo') return 'promo';
  if (provider === 'genius_pay') return 'paid';
  return 'free';
}

// Vérifie qu'un utilisateur n'a pas déjà consommé un code promo donné.
function hasRedeemedPromo(user, code) {
  return Array.isArray(user.promoCodesRedeemed) && user.promoCodesRedeemed.some((r) => r.code === code);
}

// GET /api/subscriptions/plans — liste publique des forfaits (l'accès à vie,
// accordé uniquement via code promo, n'est pas proposé à l'achat).
const getPlans = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: PLANS.filter((p) => p.id !== 'lifetime') });
});

// GET /api/subscriptions/me — forfait courant + jours restants + statut
const getMySubscription = asyncHandler(async (req, res) => {
  const isLifetime = isLifetimePlan(req.user);
  const plan = getPlan(req.user.plan) || PLANS[0];
  const elapsedMs = Date.now() - new Date(req.user.planStartedAt).getTime();

  if (isLifetime) {
    return res.json({
      success: true,
      data: {
        plan: 'lifetime',
        planLabel: plan.label,
        planStartedAt: req.user.planStartedAt,
        daysRemaining: null, // affiché « ∞ » côté frontend
        elapsedDays: Math.floor(Math.max(0, elapsedMs) / (1000 * 60 * 60 * 24)),
        isExpired: false,
        isLifetime: true,
      },
    });
  }

  const daysRemaining = getDaysRemaining(req.user);
  res.json({
    success: true,
    data: {
      plan: plan.id,
      planLabel: plan.label,
      planStartedAt: req.user.planStartedAt,
      daysRemaining,
      elapsedDays: Math.floor(Math.max(0, elapsedMs) / (1000 * 60 * 60 * 24)),
      isExpired: daysRemaining === 0,
      isLifetime: false,
    },
  });
});

// POST /api/subscriptions/choose   { planId }
// N'active directement QUE le forfait gratuit (Essai). Les forfaits payants
// et l'accès à vie doivent obligatoirement passer par /checkout ou /redeem.
const choosePlan = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  const plan = getPlan(planId);
  if (!plan) throw new ApiError(400, 'Forfait inconnu.');
  if (plan.id !== FREE_PLAN_ID) {
    throw new ApiError(400, 'Ce forfait n\'est pas activable directement : utilisez /checkout (paiement) ou un code promo (/redeem).', 'PAID_PLAN_REQUIRED');
  }

  await applyPlanToUser(req.user, plan, { provider: 'none' });

  res.json({ success: true, data: req.user.toJSON() });
});

// POST /api/subscriptions/checkout   { planId }
// Initie un paiement Genius Pay pour un forfait payant (ou active directement
// l'essai gratuit). Renvoie { payUrl, checkoutRef, mode } au frontend.
const createCheckoutSession = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  const plan = getPlan(planId);
  if (!plan) throw new ApiError(400, 'Forfait inconnu.');
  if (plan.id === 'lifetime') {
    // L'accès à vie n'est jamais proposé à l'achat : uniquement via /redeem.
    throw new ApiError(400, 'Ce forfait n\'est pas disponible à l\'achat.', 'PLAN_NOT_PURCHASABLE');
  }
  if (req.user.plan === plan.id && !isPlanExpired(req.user)) {
    throw new ApiError(409, 'Vous disposez déjà de ce forfait actif.', 'PLAN_ALREADY_ACTIVE');
  }

  // Forfait gratuit : activation immédiate, aucun paiement nécessaire.
  if (plan.id === FREE_PLAN_ID) {
    await applyPlanToUser(req.user, plan, { provider: 'none' });
    return res.json({
      success: true,
      data: { mode: 'free', plan: plan.id, payUrl: null, checkoutRef: null },
    });
  }

  // Forfait payant : il faut que Genius Pay soit configuré.
  if (!geniusPay.isConfigured()) {
    throw new ApiError(
      501,
      'Le paiement en ligne n\'est pas encore disponible. Contactez-nous ou réessayez plus tard.',
      'PAYMENT_NOT_CONFIGURED'
    );
  }

  const checkoutRef = generateCheckoutRef();
  const pricingBase = `${env.frontendUrl}/tarifs`;
  const returnUrl = `${pricingBase}?resultat=succes&ref=${checkoutRef}`;
  const cancelUrl = `${pricingBase}?resultat=annule`;

  const checkout = await geniusPay.createCheckout({
    amountUsd: plan.priceUsd,
    currency: env.geniusPay.currency,
    description: `BlackTracker — Forfait ${plan.label}`,
    externalId: checkoutRef,
    returnUrl,
    cancelUrl,
    customer: { email: req.user.email, name: req.user.name },
  });

  // Enregistre l'abonnement en attente de confirmation (le webhook le passera
  // à "active" quand Genius Pay notifiera le paiement réussi).
  await Subscription.create({
    user: req.user._id,
    planId: plan.id,
    status: 'pending',
    startedAt: new Date(),
    amountUsd: plan.priceUsd,
    provider: 'genius_pay',
    providerReference: checkout.providerRef || checkoutRef,
  });

  res.json({
    success: true,
    data: {
      mode: 'external',
      plan: plan.id,
      checkoutRef,
      payUrl: checkout.payUrl,
      amountUsd: plan.priceUsd,
    },
  });
});

// POST /api/subscriptions/webhook
// Reçoit la notification de paiement de Genius Pay et active le forfait.
// Important : cette route lit le body BRUT (voir subscription.routes.js) pour
// pouvoir vérifier la signature HMAC avant tout parsing.
//
// Payload reçu (doc officielle) :
//   { event, data: { reference, status, amount, currency, metadata, ... }, environment }
// Les événements pertinents sont "payment.success" / "payment.failed" /
// "payment.cancelled" / "payment.refunded". La référence (MTX-XXXXXXXXXX) est
// celle qu'on a stockée dans Subscription.providerReference lors du checkout.
const webhookHandler = asyncHandler(async (req, res) => {
  if (!geniusPay.isConfigured()) {
    throw new ApiError(501, 'Paiement non configuré.', 'PAYMENT_NOT_CONFIGURED');
  }

  const headers = req.headers || {};
  if (env.nodeEnv === 'development') {
    // Capture de débogage (développement uniquement) : on enregistre les
    // en-têtes et le corps BRUT du webhook pour comparer la signature reçue
    // avec celle attendue. Supprimer avant mise en production.
    try {
      fs.appendFileSync(
        path.join(__dirname, '..', '..', 'webhook-debug.jsonl'),
        JSON.stringify({ at: new Date().toISOString(), headers, rawBody: req.rawBody || '' }) + '\n'
      );
    } catch (_err) {
      /* silencieux */
    }
  }
  if (!geniusPay.verifyWebhookSignature(req.rawBody || '', headers)) {
    throw new ApiError(401, 'Signature de webhook invalide.', 'WEBHOOK_SIGNATURE_INVALID');
  }

  const payload = req.body || {};
  const event = String(headers['x-webhook-event'] || payload.event || '').toLowerCase();
  const data = payload.data || {};
  const reference = data.reference || payload.reference || '';

  if (!reference) {
    // Webhook sans référence exploitable : on accuse réception sans agir.
    return res.json({ success: true, received: true });
  }

  const subscription = await Subscription.findOne({ providerReference: reference });
  if (!subscription) {
    return res.json({ success: true, received: true, ignored: 'unknown reference' });
  }

  // Idempotence : le webhook peut être livré plusieurs fois (même événement).
  // Une subscription déjà 'active' ne doit pas être re-traitée.
  const alreadyActive = subscription.status === 'active';

  if (event === 'payment.success' && !alreadyActive) {
    subscription.status = 'active';
    subscription.rawProviderPayload = payload;
    await subscription.save();

    const user = await User.findById(subscription.user);
    if (user) {
      // Réutilise le cycle complet d'activation : reset du rappel d'expiration,
      // journalisation d'un état clean et e-mail de confirmation.
      const plan = getPlan(subscription.planId) || PLANS[0];
      await applyPlanToUser(user, plan, {
        provider: 'genius_pay',
        providerReference: reference,
        amountUsd: subscription.amountUsd,
        rawPayload: payload,
      });
    }

    return res.json({ success: true, received: true, activated: true });
  }

  if (['payment.failed', 'payment.cancelled', 'payment.refunded'].includes(event) && !alreadyActive) {
    subscription.status = 'cancelled';
    subscription.rawProviderPayload = payload;
    await subscription.save();
  }

  res.json({ success: true, received: true });
});

// POST /api/subscriptions/redeem   { code }
// Applique un code promo sur le compte courant :
//  - PROMO_CODE_MONTH    → forfait mensuel offert pour 30 jours,
//                          utilisable une seule fois par compte.
//  - PROMO_CODE_LIFETIME → accès à vie, utilisable une seule fois par compte.
const redeemPromo = asyncHandler(async (req, res) => {
  const code = String((req.body && req.body.code) || '').trim().toUpperCase();
  if (!code) throw new ApiError(400, 'Veuillez saisir un code promo.');

  const monthCode = String(env.promo.codeMonths || '').trim().toUpperCase();
  const lifetimeCode = String(env.promo.codeLifetime || '').trim().toUpperCase();

  if (code !== monthCode && code !== lifetimeCode) {
    throw new ApiError(400, 'Ce code promo est invalide ou n\'existe plus.', 'INVALID_PROMO_CODE');
  }

  if (code === monthCode) {
    if (hasRedeemedPromo(req.user, code)) {
      throw new ApiError(409, 'Vous avez déjà utilisé ce code promo.', 'PROMO_ALREADY_USED');
    }
    if (isLifetimePlan(req.user)) {
      throw new ApiError(409, 'Vous disposez déjà d\'un accès à vie.', 'PLAN_EQUAL_OR_BETTER');
    }
    if (req.user.plan === 'annuel' && getDaysRemaining(req.user) >= 30) {
      throw new ApiError(409, 'Vous disposez déjà d\'un forfait annuel actif.', 'PLAN_EQUAL_OR_BETTER');
    }

    req.user.promoCodesRedeemed = [...(req.user.promoCodesRedeemed || []), { code }];
    const plan = getPlan('mensuel');
    await applyPlanToUser(req.user, plan, { provider: 'promo' });

    return res.json({
      success: true,
      data: { plan: 'mensuel', label: plan.label, durationDays: 30, isLifetime: false },
    });
  }

  // Code "accès à vie".
  if (isLifetimePlan(req.user)) {
    return res.json({
      success: true,
      data: { plan: 'lifetime', isLifetime: true, alreadyActive: true },
    });
  }
  if (hasRedeemedPromo(req.user, code)) {
    throw new ApiError(409, 'Vous avez déjà utilisé ce code promo.', 'PROMO_ALREADY_USED');
  }

  req.user.promoCodesRedeemed = [...(req.user.promoCodesRedeemed || []), { code }];
  const plan = getPlan('lifetime');
  await applyPlanToUser(req.user, plan, { provider: 'promo' });

  return res.json({
    success: true,
    data: { plan: 'lifetime', label: plan.label, isLifetime: true },
  });
});

module.exports = { getPlans, getMySubscription, choosePlan, createCheckoutSession, webhookHandler, redeemPromo, getDaysRemaining };