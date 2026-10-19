// Contrôleur Markets.
//  - Le catalogue de RÉFÉRENCE (isCustom: false) est partagé entre tous les
//    utilisateurs connectés (lecture seule, intouchable).
//  - Les marchés PERSONNALISÉS (isCustom: true) sont PRIVÉS : chaque utilisateur
//    ne voit, ne crée et ne supprime que les siens.
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

// GET /api/markets  → catalogue de référence + MES marchés personnalisés
const getMarkets = asyncHandler(async (req, res) => {
  const markets = await Market.find({
    $or: [{ isCustom: false }, { createdBy: req.user._id }],
  }).sort({ category: 1, symbol: 1 });
  res.json({ success: true, data: markets });
});

// POST /api/markets   (ajout manuel depuis /marches)
const createMarket = asyncHandler(async (req, res) => {
  const data = pickMarketFields(req.body);
  if (!data.symbol || !data.name || !data.category || !data.description) {
    throw new ApiError(400, 'Symbole, nom, catégorie et description sont requis.');
  }

  const symbol = String(data.symbol).trim().toUpperCase();

  // Conflit avec le catalogue de référence OU avec un de MES marchés (les
  // marchés personnalisés des autres utilisateurs ne comptent pas).
  const existing = await Market.findOne({
    symbol,
    $or: [{ isCustom: false }, { createdBy: req.user._id }],
  });
  if (existing) {
    throw new ApiError(409, `Un marché avec le symbole "${data.symbol}" existe déjà.`);
  }

  const market = await Market.create({ ...data, symbol, isCustom: true, createdBy: req.user._id });
  res.status(201).json({ success: true, data: market });
});

// DELETE /api/markets/:id
// Un utilisateur ne peut supprimer que SES marchés personnalisés ; le
// catalogue de référence est partagé et intouchable.
const deleteMarket = asyncHandler(async (req, res) => {
  const market = await Market.findById(req.params.id);
  if (!market) {
    throw new ApiError(404, 'Marché introuvable.');
  }
  if (!market.isCustom) {
    throw new ApiError(403, 'Ce marché de référence ne peut pas être supprimé.');
  }
  // Un marché personnalisé d'un autre compte est traité comme inexistant
  // (on ne révèle même pas son existence).
  if (!market.createdBy || market.createdBy.toString() !== req.user._id.toString()) {
    throw new ApiError(404, 'Marché introuvable.');
  }
  await Market.findByIdAndDelete(market._id);
  res.json({ success: true, data: market });
});

module.exports = { getMarkets, createMarket, deleteMarket };
