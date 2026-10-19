// Routes trades : /api/trades/...  (toutes protégées par JWT)
// Les chemins correspondent exactement à ceux attendus par
// src/services/api/tradesApi.js côté frontend.
const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
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
// Le logiciel est entièrement gratuit : aucune restriction par forfait.
router.post('/', createTrade);
router.post('/bulk', createTradesBulk);
router.put('/:id', updateTrade);
router.delete('/:id', deleteTrade);

module.exports = router;
