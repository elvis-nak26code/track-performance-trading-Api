// Contrôleur Stratégie : CRUD filtré par utilisateur + activation exclusive
// (une seule stratégie active à la fois). La checklist pré-trade est stockée
// dans la stratégie elle-même (checklistItems).

const Strategy = require('../models/Strategy');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// Picks d'une tentative de mise à jour les champs autorisés du modèle.
const ALLOWED_FIELDS = [
  'name',
  'description',
  'rules',
  'config',
  'checklistItems',
  'isActive',
];

function pickStrategyFields(body) {
  const data = {};

  ALLOWED_FIELDS.forEach((field) => {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  });

  return data;
}

// GET /api/strategies
const getStrategies = asyncHandler(async (req, res) => {
  const strategies = await Strategy.find({ user: req.user._id }).sort({
    isActive: -1,
    updatedAt: -1,
  });

  res.json({
    success: true,
    data: strategies,
  });
});

// GET /api/strategies/active
const getActiveStrategy = asyncHandler(async (req, res) => {
  const strategy = await Strategy.findOne({
    user: req.user._id,
    isActive: true,
  });

  res.json({
    success: true,
    data: strategy || null,
  });
});

// GET /api/strategies/:id
const getStrategyById = asyncHandler(async (req, res) => {
  const strategy = await Strategy.findOne({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!strategy) {
    throw new ApiError(404, 'Stratégie introuvable.');
  }

  res.json({
    success: true,
    data: strategy,
  });
});

// POST /api/strategies
const createStrategy = asyncHandler(async (req, res) => {
  const strategy = await Strategy.create({
    ...pickStrategyFields(req.body),
    user: req.user._id,
  });

  // Première stratégie de l'utilisateur : on l'active directement pour que la
  // checklist pré-trade du tableau de bord soit tout de suite disponible.
  if (req.body.isActive === undefined) {
    const count = await Strategy.countDocuments({ user: req.user._id });
    if (count === 1) {
      strategy.isActive = true;
      await strategy.save();
    }
  }

  res.status(201).json({
    success: true,
    data: strategy,
  });
});

// PUT /api/strategies/:id
const updateStrategy = asyncHandler(async (req, res) => {
  const strategy = await Strategy.findOne({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!strategy) {
    throw new ApiError(404, 'Stratégie introuvable.');
  }

  const data = pickStrategyFields(req.body);

  // L'activation/désactivation passe par l'endpoint dédié pour garder une
  // seule stratégie active ; on ignore isActive reçu ici.
  delete data.isActive;

  Object.assign(strategy, data);
  await strategy.save();

  res.json({
    success: true,
    data: strategy,
  });
});

// PUT /api/strategies/:id/activate
const activateStrategy = asyncHandler(async (req, res) => {
  const strategy = await Strategy.findOne({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!strategy) {
    throw new ApiError(404, 'Stratégie introuvable.');
  }

  // Désactive les autres stratégies de l'utilisateur, puis active celle-ci.
  await Strategy.updateMany(
    { user: req.user._id, isActive: true, _id: { $ne: strategy._id } },
    { $set: { isActive: false } }
  );

  strategy.isActive = true;
  await strategy.save();

  res.json({
    success: true,
    data: strategy,
  });
});

// DELETE /api/strategies/:id
const deleteStrategy = asyncHandler(async (req, res) => {
  const strategy = await Strategy.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!strategy) {
    throw new ApiError(404, 'Stratégie introuvable.');
  }

  res.json({
    success: true,
    data: { id: strategy._id.toString() },
  });
});

module.exports = {
  getStrategies,
  getActiveStrategy,
  getStrategyById,
  createStrategy,
  updateStrategy,
  activateStrategy,
  deleteStrategy,
};