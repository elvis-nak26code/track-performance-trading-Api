// Point d'entrée unique des routes de l'API : agrège tous les sous-routeurs
// sous leur préfixe respectif. app.js ne monte que ce seul routeur sur "/api".
const express = require('express');

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const tradeRoutes = require('./trade.routes');
const journalRoutes = require('./journal.routes');
const marketRoutes = require('./market.routes');
const subscriptionRoutes = require('./subscription.routes');

const router = express.Router();

// Petit endpoint de santé, pratique pour vérifier qu'un déploiement répond
// (utilisable par un service de monitoring ou un load balancer).
router.get('/health', (_req, res) => {
  res.json({ success: true, message: 'API Journal de Trading opérationnelle.' });
});

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/trades', tradeRoutes);
router.use('/journal-entries', journalRoutes);
router.use('/markets', marketRoutes);
router.use('/subscriptions', subscriptionRoutes);

module.exports = router;
