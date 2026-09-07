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
router.post('/', createTrade);
router.post('/bulk', createTradesBulk);
router.get('/:id', getTradeById);
router.put('/:id', updateTrade);
router.delete('/:id', deleteTrade);

module.exports = router;
