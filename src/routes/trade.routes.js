// Routes trades : /api/trades/...  (toutes protégées par JWT)
// Les chemins correspondent exactement à ceux attendus par
// src/services/api/tradesApi.js côté frontend.
const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const { requireActivePlan } = require('../middlewares/plan.middleware');
const {
  getTrades,
  getTradeById,
  createTrade,
  createTradesBulk,
  updateTrade,
  deleteTrade,
} = require('../controllers/trade.controller');

const router = express.Router();

router.use(protect);

router.get('/', getTrades);
router.get('/bulk', (req, res) => {
  res.status(405).json({ success: false, message: 'Utilisez POST /bulk pour importer.' });
});
router.get('/:id', getTradeById);
// Créer un nouveau trade (ou en importer) exige un forfait actif : l'utilisateur
// dont l'essai est terminé peut TOUT LIRE (GET), mais plus rien ajouter. Les
// modifications/suppressions de trades existants restent permises (gestion des
// données déjà enregistrées).
router.post('/', requireActivePlan, createTrade);
router.post('/bulk', requireActivePlan, createTradesBulk);
router.put('/:id', updateTrade);
router.delete('/:id', deleteTrade);

module.exports = router;
