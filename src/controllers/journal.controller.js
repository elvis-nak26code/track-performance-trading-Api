// Contrôleur JournalEntry : CRUD complet, filtré par utilisateur. Vérifie
// systématiquement que les trades liés (linkedTradeIds) appartiennent bien
// à l'utilisateur courant, pour ne jamais exposer par erreur l'existence
// d'un trade d'un autre compte.
const JournalEntry = require('../models/JournalEntry');
const Trade = require('../models/Trade');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

const ALLOWED_FIELDS = ['date', 'instrument', 'mood', 'text', 'screenshots'];

function pickEntryFields(body) {
  const data = {};
  ALLOWED_FIELDS.forEach((field) => {
    if (body[field] !== undefined) data[field] = body[field];
  });
  return data;
}

// Vérifie que chaque id de `linkedTradeIds` correspond à un trade existant
// appartenant à l'utilisateur, puis retourne le tableau nettoyé.
async function resolveLinkedTrades(linkedTradeIds, userId) {
  if (!Array.isArray(linkedTradeIds) || linkedTradeIds.length === 0) return [];
  const trades = await Trade.find({ _id: { $in: linkedTradeIds }, user: userId }).select('_id');
  return trades.map((t) => t._id);
}

// GET /api/journal-entries
const getJournalEntries = asyncHandler(async (req, res) => {
  const entries = await JournalEntry.find({ user: req.user._id }).sort({ date: -1, createdAt: -1 });
  res.json({ success: true, data: entries });
});

// GET /api/journal-entries/:id
const getJournalEntryById = asyncHandler(async (req, res) => {
  const entry = await JournalEntry.findOne({ _id: req.params.id, user: req.user._id });
  if (!entry) throw new ApiError(404, 'Entrée de journal introuvable.');
  res.json({ success: true, data: entry });
});

// POST /api/journal-entries
const createJournalEntry = asyncHandler(async (req, res) => {
  const linkedTrades = await resolveLinkedTrades(req.body.linkedTradeIds, req.user._id);
  const entry = await JournalEntry.create({
    ...pickEntryFields(req.body),
    linkedTrades,
    user: req.user._id,
  });
  res.status(201).json({ success: true, data: entry });
});

// PUT /api/journal-entries/:id
const updateJournalEntry = asyncHandler(async (req, res) => {
  const update = pickEntryFields(req.body);
  if (req.body.linkedTradeIds !== undefined) {
    update.linkedTrades = await resolveLinkedTrades(req.body.linkedTradeIds, req.user._id);
  }

  const entry = await JournalEntry.findOneAndUpdate(
    { _id: req.params.id, user: req.user._id },
    update,
    { new: true, runValidators: true }
  );
  if (!entry) throw new ApiError(404, 'Entrée de journal introuvable.');
  res.json({ success: true, data: entry });
});

// DELETE /api/journal-entries/:id
const deleteJournalEntry = asyncHandler(async (req, res) => {
  const entry = await JournalEntry.findOneAndDelete({ _id: req.params.id, user: req.user._id });
  if (!entry) throw new ApiError(404, 'Entrée de journal introuvable.');
  res.json({ success: true, data: { id: req.params.id } });
});

module.exports = {
  getJournalEntries,
  getJournalEntryById,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
};
