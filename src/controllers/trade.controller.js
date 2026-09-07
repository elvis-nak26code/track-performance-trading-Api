// Contrôleur Trades : CRUD complet, toujours filtré par utilisateur
// (req.user, injecté par le middleware "protect") pour garantir qu'un
// utilisateur ne peut jamais lire ou modifier les trades d'un autre compte.
const Trade = require('../models/Trade');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const ALLOWED_FIELDS = [
  'date',
  'symbol',
  'strategies',
  'direction',
  'entryPrice',
  'exitPrice',
  'quantity',
  'r',
  'pnl',
];

// Ne garde que les champs autorisés du body (évite qu'un client injecte
// par erreur ou malveillance un champ "user" différent du sien, par exemple).
function pickTradeFields(body) {
  const data = {};
  ALLOWED_FIELDS.forEach((field) => {
    if (body[field] !== undefined) data[field] = body[field];
  });
  return data;
}

// GET /api/trades
const getTrades = asyncHandler(async (req, res) => {
  const trades = await Trade.find({ user: req.user._id }).sort({ date: -1, createdAt: -1 });
  res.json({ success: true, data: trades });
});

// GET /api/trades/:id
const getTradeById = asyncHandler(async (req, res) => {
  const trade = await Trade.findOne({ _id: req.params.id, user: req.user._id });
  if (!trade) throw new ApiError(404, 'Trade introuvable.');
  res.json({ success: true, data: trade });
});

// POST /api/trades
const createTrade = asyncHandler(async (req, res) => {
  const trade = await Trade.create({ ...pickTradeFields(req.body), user: req.user._id });
  res.status(201).json({ success: true, data: trade });
});

// POST /api/trades/bulk   { trades: [...] }  — utilisé par l'import CSV du frontend
const createTradesBulk = asyncHandler(async (req, res) => {
  const { trades } = req.body;
  if (!Array.isArray(trades) || trades.length === 0) {
    throw new ApiError(400, "Le champ 'trades' doit être un tableau non vide.");
  }

  const docs = trades.map((t) => ({ ...pickTradeFields(t), user: req.user._id }));
  const created = await Trade.insertMany(docs, { ordered: false });
  res.status(201).json({ success: true, data: created });
});

// PUT /api/trades/:id
const updateTrade = asyncHandler(async (req, res) => {
  const trade = await Trade.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    pickTradeFields(req.body),
    { new: true, runValidators: true }
  );
  if (!trade) throw new ApiError(404, 'Trade introuvable.');
  res.json({ success: true, data: trade });
});

// DELETE /api/trades/:id
const deleteTrade = asyncHandler(async (req, res) => {
  const trade = await Trade.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!trade) throw new ApiError(404, 'Trade introuvable.');
  res.json({ success: true, data: { id: req.params.id } });
});

module.exports = { getTrades, getTradeById, createTrade, createTradesBulk, updateTrade, deleteTrade };
