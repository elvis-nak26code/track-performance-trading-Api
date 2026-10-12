// Routes Stratégie : la checklist pré-trade vit dans la stratégie active
// (champ checklistItems). Toutes les route sont protégées par authentification.

const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const {
  getStrategies,
  getActiveStrategy,
  getStrategyById,
  createStrategy,
  updateStrategy,
  activateStrategy,
  deleteStrategy,
} = require('../controllers/strategy.controller');

const router = express.Router();

router.use(protect);

router.get('/active', getActiveStrategy);
router.get('/', getStrategies);
router.post('/', createStrategy);
router.get('/:id', getStrategyById);
router.put('/:id', updateStrategy);
router.put('/:id/activate', activateStrategy);
router.delete('/:id', deleteStrategy);

module.exports = router;