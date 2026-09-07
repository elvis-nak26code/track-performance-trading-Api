// Contrôleur Subscription : expose les forfaits disponibles (/tarifs côté
// frontend) et permet de choisir un forfait.
//
// IMPORTANT : le paiement réel via Genius Pay n'est PAS intégré ici. Pour
// l'instant, "choisir un forfait" met simplement à jour le forfait de
// l'utilisateur (comme le fait le frontend en mock aujourd'hui), pour que
// l'intégration reste possible sans rien casser. Quand Genius Pay sera
// branché :
//   1. `choosePlan` devra d'abord initier un paiement via l'API Genius Pay
//      (voir env.geniusPay) et renvoyer une URL de paiement au frontend au
//      lieu d'activer le forfait immédiatement.
//   2. Un nouvel endpoint webhook (ex: POST /api/subscriptions/webhook)
//      recevra la confirmation de paiement de Genius Pay et c'est LUI qui
//      activera le forfait + créera l'entrée Subscription correspondante.
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const MONTHLY_PRICE_USD = 5;
const ANNUAL_PRICE_USD = 50;
const ANNUAL_EQUIVALENT_IF_MONTHLY = MONTHLY_PRICE_USD * 12;
const ANNUAL_DISCOUNT_PERCENT = Math.round(
  ((ANNUAL_EQUIVALENT_IF_MONTHLY - ANNUAL_PRICE_USD) / ANNUAL_EQUIVALENT_IF_MONTHLY) * 100
);

// Doit rester cohérent avec src/constants/plans.js côté frontend.
const PLANS = [
  { id: 'essai', label: 'Essai gratuit', priceUsd: 0, durationDays: 7 },
  { id: 'mensuel', label: 'Mensuel', priceUsd: MONTHLY_PRICE_USD, durationDays: 30 },
  { id: 'annuel', label: 'Annuel', priceUsd: ANNUAL_PRICE_USD, durationDays: 365, discountPercent: ANNUAL_DISCOUNT_PERCENT },
];

function getPlan(planId) {
  return PLANS.find((p) => p.id === planId);
}

// GET /api/subscriptions/plans — liste publique des forfaits
const getPlans = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: PLANS });
});

// GET /api/subscriptions/me — forfait courant + jours restants
const getMySubscription = asyncHandler(async (req, res) => {
  const plan = getPlan(req.user.plan) || PLANS[0];
  const elapsedDays = Math.floor((Date.now() - new Date(req.user.planStartedAt).getTime()) / (1000 * 60 * 60 * 24));
  const daysRemaining = Math.max(0, plan.durationDays - elapsedDays);

  res.json({
    success: true,
    data: { plan: plan.id, planStartedAt: req.user.planStartedAt, daysRemaining },
  });
});

// POST /api/subscriptions/choose   { planId }
// À REMPLACER par un vrai flux de paiement Genius Pay pour les forfaits payants.
const choosePlan = asyncHandler(async (req, res) => {
  const { planId } = req.body;
  const plan = getPlan(planId);
  if (!plan) throw new ApiError(400, 'Forfait inconnu.');

  const planStartedAt = new Date();
  req.user.plan = plan.id;
  req.user.planStartedAt = planStartedAt;
  await req.user.save();

  await Subscription.create({
    user: req.user._id,
    planId: plan.id,
    status: 'active',
    startedAt: planStartedAt,
    amountUsd: plan.priceUsd,
    provider: 'none', // deviendra 'genius_pay' une fois le paiement réel branché
  });

  res.json({ success: true, data: req.user.toJSON() });
});

module.exports = { getPlans, getMySubscription, choosePlan };
