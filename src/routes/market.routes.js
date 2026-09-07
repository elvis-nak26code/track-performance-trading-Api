// Routes marchés : /api/markets/...  (protégées par JWT, catalogue partagé)
const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const { getMarkets, createMarket } = require('../controllers/market.controller');

const router = express.Router();

router.use(protect);

router.get('/', getMarkets);
router.post('/', createMarket);

module.exports = router;
