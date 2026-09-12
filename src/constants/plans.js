// Définition partagée des forfaits (backend). Miroir de
// src/constants/plans.js côté frontend et de PLAN_DURATIONS_DAYS dans
// plan.middleware.js : toute modification doit être répercutée aux trois
// endroits pour que l'interface et l'API restent cohérentes.
const MONTHLY_PRICE_USD = 5;
const ANNUAL_PRICE_USD = 50;
const ANNUAL_EQUIVALENT_IF_MONTHLY = MONTHLY_PRICE_USD * 12;
const ANNUAL_DISCOUNT_PERCENT = Math.round(
  ((ANNUAL_EQUIVALENT_IF_MONTHLY - ANNUAL_PRICE_USD) / ANNUAL_EQUIVALENT_IF_MONTHLY) * 100
);

const PLANS = [
  { id: 'essai', label: 'Essai gratuit', priceUsd: 0, durationDays: 7 },
  { id: 'mensuel', label: 'Mensuel', priceUsd: MONTHLY_PRICE_USD, durationDays: 30 },
  { id: 'annuel', label: 'Annuel', priceUsd: ANNUAL_PRICE_USD, durationDays: 365, discountPercent: ANNUAL_DISCOUNT_PERCENT },
  // Accordé exclusivement via le code promo d'accès à vie (jamais achetable).
  { id: 'lifetime', label: 'Accès à vie', priceUsd: 0, durationDays: Infinity },
];

function getPlan(planId) {
  return PLANS.find((p) => p.id === planId);
}

const FREE_PLAN_ID = 'essai';

module.exports = { PLANS, getPlan, FREE_PLAN_ID, MONTHLY_PRICE_USD, ANNUAL_PRICE_USD, ANNUAL_DISCOUNT_PERCENT };