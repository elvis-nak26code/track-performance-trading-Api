// Routes journal : /api/journal-entries/...  (toutes protégées par JWT)
// Chemins alignés sur src/services/api/journalApi.js côté frontend.

const upload = require('../middlewares/upload.middleware');

const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
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
// Le logiciel est entièrement gratuit : aucune restriction par forfait.
router.post('/', upload.array('screenshots', upload.MAX_SCREENSHOTS), createJournalEntry);
router.get('/:id', getJournalEntryById);
router.put('/:id', upload.array('screenshots', upload.MAX_SCREENSHOTS), updateJournalEntry);
router.delete('/:id', deleteJournalEntry);

module.exports = router;
