// Routes utilisateur courant : /api/users/...  (toutes protégées par JWT)
const express = require('express');
const { protect } = require('../middlewares/auth.middleware');
const { getMe, updateProfile, updateSettings } = require('../controllers/user.controller');

const router = express.Router();

router.use(protect);

router.get('/me', getMe);
router.put('/me', updateProfile);
router.put('/me/settings', updateSettings);

module.exports = router;
