// Routes abonnement : /api/subscriptions/...
// GET /plans est public (utile pour afficher /tarifs avant connexion) ;
// POST /webhook est public (Genius Pay ne peut pas envoyer de JWT) mais la
// signature HMAC est vérifiée dans le contrôleur ; le reste nécessite d'être connecté.
const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const {
  getPlans,
  getMySubscription,
  choosePlan,
  createCheckoutSession,
  webhookHandler,
  redeemPromo,
} = require('../controllers/subscription.controller');

const router = express.Router();

router.get('/plans', getPlans);
router.get('/me', protect, getMySubscription);
router.post('/choose', protect, choosePlan);
router.post('/checkout', protect, createCheckoutSession);
router.post('/redeem', protect, redeemPromo);
// Le corps brut est disponible via req.rawBody (option `verify` du parser JSON
// global, voir app.js) pour vérifier la signature avant traitement.
router.post('/webhook', webhookHandler);

module.exports = router;
