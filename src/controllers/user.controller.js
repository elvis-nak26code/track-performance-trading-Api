// Contrôleur "utilisateur courant" : lecture du profil (/profil côté
// frontend), mise à jour du nom, et mise à jour des paramètres de calcul
// (valeur de 1R en $, risque par défaut) — la même logique que le
// SettingsContext du frontend, mais persistée côté serveur.
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

// GET /api/users/me
const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, data: req.user.toJSON() });
});

// PUT /api/users/me   { name }
const updateProfile = asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    throw new ApiError(400, 'Le nom ne peut pas être vide.');
  }
  req.user.name = name.trim();
  await req.user.save();
  res.json({ success: true, data: req.user.toJSON() });
});

// PUT /api/users/me/settings   { rValueDollars, defaultRiskPercent }
const updateSettings = asyncHandler(async (req, res) => {
  const { rValueDollars, defaultRiskPercent } = req.body;

  if (rValueDollars !== undefined) {
    if (Number(rValueDollars) < 0) throw new ApiError(400, 'La valeur de 1R doit être positive.');
    req.user.settings.rValueDollars = Number(rValueDollars);
  }
  if (defaultRiskPercent !== undefined) {
    if (Number(defaultRiskPercent) < 0) throw new ApiError(400, 'Le risque par défaut doit être positif.');
    req.user.settings.defaultRiskPercent = Number(defaultRiskPercent);
  }

  await req.user.save();
  res.json({ success: true, data: req.user.toJSON() });
});

module.exports = { getMe, updateProfile, updateSettings };
