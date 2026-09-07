// Routes abonnement : /api/subscriptions/...
// GET /plans est public (utile pour afficher /tarifs avant connexion) ;
// le reste nécessite d'être connecté.
const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const { getPlans, getMySubscription, choosePlan } = require('../controllers/subscription.controller');

const router = express.Router();

router.get('/plans', getPlans);
router.get('/me', protect, getMySubscription);
router.post('/choose', protect, choosePlan);

module.exports = router;
