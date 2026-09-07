// Contrôleur Markets : catalogue de référence PARTAGÉ entre tous les
// utilisateurs (contrairement aux trades/journal, ce n'est pas une donnée
// privée). La lecture est ouverte à tout utilisateur connecté ; l'ajout
// manuel enregistre qui a créé l'entrée (isCustom + createdBy) à titre
// d'audit, sans restreindre la visibilité.
const Market = require('../models/Market');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const ALLOWED_FIELDS = ['symbol', 'name', 'category', 'tags', 'description'];

function pickMarketFields(body) {
  const data = {};
  ALLOWED_FIELDS.forEach((field) => {
    if (body[field] !== undefined) data[field] = body[field];
  });
  return data;
}

// GET /api/markets
const getMarkets = asyncHandler(async (_req, res) => {
  const markets = await Market.find().sort({ category: 1, symbol: 1 });
  res.json({ success: true, data: markets });
});

// POST /api/markets   (ajout manuel depuis /marches)
const createMarket = asyncHandler(async (req, res) => {
  const data = pickMarketFields(req.body);
  if (!data.symbol || !data.name || !data.category || !data.description) {
    throw new ApiError(400, 'Symbole, nom, catégorie et description sont requis.');
  }

  const existing = await Market.findOne({ symbol: data.symbol.toUpperCase() });
  if (existing) {
    throw new ApiError(409, `Un marché avec le symbole "${data.symbol}" existe déjà.`);
  }

  const market = await Market.create({ ...data, isCustom: true, createdBy: req.user._id });
  res.status(201).json({ success: true, data: market });
});

module.exports = { getMarkets, createMarket };
