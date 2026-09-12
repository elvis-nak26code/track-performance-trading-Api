// Routes journal : /api/journal-entries/...  (toutes protégées par JWT)
// Chemins alignés sur src/services/api/journalApi.js côté frontend.

const upload = require('../middlewares/upload.middleware');

const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const { requireActivePlan } = require('../middlewares/plan.middleware');
const {
  getJournalEntries,
  getJournalEntryById,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
} = require('../controllers/journal.controller');

const router = express.Router();

router.use(protect);

router.get('/', getJournalEntries);
// Créer une entrée de journal exige un forfait actif ; lire/éditer/supprimer
// les entrées existantes reste possible (les données restent visibles).
router.post('/', requireActivePlan, upload.array('screenshots', 6), createJournalEntry);
router.get('/:id', getJournalEntryById);
router.put('/:id', upload.array('screenshots', 6), updateJournalEntry);
router.delete('/:id', deleteJournalEntry);

module.exports = router;
