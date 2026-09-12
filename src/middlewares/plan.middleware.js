// Middleware d'accès par forfait. Un utilisateur dont le forfait courant
// (essai gratuit OU abonnement payant 30/365 jours) a expiré ne peut plus
// faire d'écriture (création de trade / entrée de journal). Ses données et
// son journal restent LISIBLES — seul l'ajout de nouvelles entrées est bloqué
// côté serveur (le frontend bloque aussi l'affichage des statistiques).
//
// La même logique de calcul (jours restants basés sur planStartedAt + durée du
// forfait) est reflétée côté frontend dans src/constants/plans.js, pour que
// l'interface et l'API soient cohérentes.
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Doit rester cohérent avec subscription.controller.js (PLANS) et
// src/constants/plans.js côté frontend.
const PLAN_DURATIONS_DAYS = {
  essai: 7,
  mensuel: 30,
  annuel: 365,
  lifetime: Infinity, // accès à vie : ne peut jamais expirer
};

function getDurationDays(planId) {
  return PLAN_DURATIONS_DAYS[planId] || 0;
}

/** Un compte "lifetime" (accès à vie via code promo) n'expire jamais. */
function isLifetimePlan(user) {
  return Boolean(user && user.plan === 'lifetime');
}

/**
 * Calcule les jours restants sur le forfait courant d'un utilisateur.
 * Retourne 0 dès que la durée est atteinte (forfait expiré).
 * Retourne Infinity pour un compte "lifetime".
 */
function getDaysRemaining(user) {
  if (isLifetimePlan(user)) return Infinity;
  const durationDays = getDurationDays(user.plan);
  const elapsedMs = Date.now() - new Date(user.planStartedAt).getTime();
  const elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
  return Math.max(0, durationDays - elapsedDays);
}

/** Un forfait est considéré expiré quand 0 jour ne reste. */
function isPlanExpired(user) {
  return getDaysRemaining(user) === 0;
}

/**
 * Bloque l'accès aux routes d'écriture quand le forfait est expiré.
 * Réponse : HTTP 403 avec le code métier PLAN_EXPIRED, que le frontend
 * écoute pour afficher la fenêtre d'invitation au paiement.
 */
const requireActivePlan = asyncHandler(async (req, _res, next) => {
  if (isPlanExpired(req.user)) {
    throw new ApiError(
      403,
      'Votre essai gratuit est terminé : souscrivez un forfait pour continuer à ajouter des entrées. Vos données restent enregistrées.',
      'PLAN_EXPIRED'
    );
  }
  next();
});

module.exports = { requireActivePlan, isPlanExpired, getDaysRemaining, isLifetimePlan };