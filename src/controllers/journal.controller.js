
// Contrôleur JournalEntry : CRUD complet, filtré par utilisateur.
// Les trades liés sont toujours vérifiés pour appartenir à l'utilisateur courant.

const JournalEntry = require('../models/JournalEntry');
const Trade = require('../models/Trade');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const cloudinary = require('../config/cloudinary');
const crypto = require('crypto');

const ALLOWED_FIELDS = ['date', 'instrument', 'mood', 'text'];

function pickEntryFields(body) {
  const data = {};

  ALLOWED_FIELDS.forEach((field) => {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  });

  return data;
}

// Vérifie que les trades liés appartiennent bien à l'utilisateur.
async function resolveLinkedTrades(linkedTradeIds, userId) {
  if (!Array.isArray(linkedTradeIds) || linkedTradeIds.length === 0) {
    return [];
  }

  const trades = await Trade.find({
    _id: { $in: linkedTradeIds },
    user: userId,
  }).select('_id');

  return trades.map((trade) => trade._id);
}

// Parse proprement les champs JSON envoyés avec FormData.
function parseJsonField(value, fallback = []) {
  if (!value || typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new ApiError(
      400,
      'Données JSON invalides reçues par le serveur.'
    );
  }
}

// Normalise les blocs texte/image envoyés par le frontend (même s'ils
// arrivent sous forme de chaîne JSON dans le multipart), puis vérifie que
// chaque bloc image référence bien une capture existante.
function buildBlocks(value, screenshotIds) {
  const parsed = parseJsonField(value, []);

  if (!Array.isArray(parsed)) {
    throw new ApiError(400, 'Le champ "blocks" doit être un tableau.');
  }

  const screenshotIdSet = new Set(screenshotIds);

  return parsed.map((block) => {
    const type = block && block.type === 'image' ? 'image' : 'text';

    if (type === 'image') {
      const screenshotId = String(block.screenshotId || '');
      if (!screenshotIdSet.has(screenshotId)) {
        throw new ApiError(
          400,
          "Le bloc image référence une capture d'écran qui n'existe pas dans cette entrée."
        );
      }
      const rawWidth = Number(block.width);
      const meta = { type: 'image', screenshotId };
      // Largeur d'affichage choisie par l'auteur (redimensionnement sur la page).
      if (Number.isFinite(rawWidth) && rawWidth > 0) {
        meta.width = rawWidth;
      }
      return meta;
    }

    return { type: 'text', content: String(block.content || '') };
  });
}

// Upload d'une image vers Cloudinary.
function uploadImageToCloudinary(file, userId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `trading-journal/users/${userId}`,
        resource_type: 'image',
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve({
          public_id: result.public_id,
          url: result.secure_url,
        });
      }
    );

    uploadStream.end(file.buffer);
  });
}

// GET /api/journal-entries
const getJournalEntries = asyncHandler(async (req, res) => {
  const entries = await JournalEntry.find({
    user: req.user._id,
  }).sort({
    date: -1,
    createdAt: -1,
  });

  res.json({
    success: true,
    data: entries,
  });
});

// GET /api/journal-entries/:id
const getJournalEntryById = asyncHandler(async (req, res) => {
  const entry = await JournalEntry.findOne({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!entry) {
    throw new ApiError(404, 'Entrée de journal introuvable.');
  }

  res.json({
    success: true,
    data: entry,
  });
});

// POST /api/journal-entries
const createJournalEntry = asyncHandler(async (req, res) => {
  const linkedTradeIds = parseJsonField(
    req.body.linkedTradeIds,
    []
  );

  const linkedTrades = await resolveLinkedTrades(
    linkedTradeIds,
    req.user._id
  );

  const metadata = parseJsonField(
    req.body.screenshotMetadata,
    []
  );

  const screenshots = [];

  for (let i = 0; i < (req.files || []).length; i++) {
    const file = req.files[i];

    const uploaded = await uploadImageToCloudinary(
      file,
      req.user._id.toString()
    );

    const item = metadata[i] || {};

    screenshots.push({
      id: item.id || crypto.randomUUID(),
      public_id: uploaded.public_id,
      url: uploaded.url,
      name: item.name || file.originalname,
      caption: item.caption || '',
    });
  }

  const blocks = buildBlocks(
    req.body.blocks,
    screenshots.map((s) => s.id)
  );

  const entry = await JournalEntry.create({
    ...pickEntryFields(req.body),
    screenshots,
    blocks,
    linkedTrades,
    user: req.user._id,
  });

  res.status(201).json({
    success: true,
    data: entry,
  });
});

// PUT /api/journal-entries/:id
const updateJournalEntry = asyncHandler(async (req, res) => {
  const entry = await JournalEntry.findOne({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!entry) {
    throw new ApiError(404, 'Entrée de journal introuvable.');
  }

  const update = pickEntryFields(req.body);

  // --------------------------------------------------
  // Trades liés
  // --------------------------------------------------

  if (req.body.linkedTradeIds !== undefined) {
    const linkedTradeIds = parseJsonField(
      req.body.linkedTradeIds,
      []
    );

    update.linkedTrades = await resolveLinkedTrades(
      linkedTradeIds,
      req.user._id
    );
  }

  // --------------------------------------------------
  // Captures d'écran
  // --------------------------------------------------

  const metadata = parseJsonField(
    req.body.screenshotMetadata,
    []
  );

  const existingScreenshots = entry.screenshots || [];

  // IDs des anciennes captures que le frontend souhaite conserver.
  const keptIds = metadata
    .filter((item) => !item.isNew)
    .map((item) => item.id)
    .filter(Boolean);

  // Anciennes captures supprimées par l'utilisateur.
  const screenshotsToDelete = existingScreenshots.filter(
    (screenshot) => !keptIds.includes(screenshot.id)
  );

  // --------------------------------------------------
  // Conservation des anciennes captures
  // --------------------------------------------------

  const screenshots = existingScreenshots
    .filter((screenshot) => keptIds.includes(screenshot.id))
    .map((screenshot) => {
      const item = metadata.find(
        (meta) => meta.id === screenshot.id
      );

      return {
        id: screenshot.id,
        public_id: screenshot.public_id,
        url: screenshot.url,
        name: item?.name || screenshot.name || '',
        caption: item?.caption || '',
      };
    });

  // --------------------------------------------------
  // Upload des nouvelles captures
  // --------------------------------------------------

  const newMetadata = metadata.filter(
    (item) => item.isNew
  );

  for (let i = 0; i < (req.files || []).length; i++) {
    const file = req.files[i];
    const item = newMetadata[i] || {};

    const uploaded = await uploadImageToCloudinary(
      file,
      req.user._id.toString()
    );

    screenshots.push({
      id: item.id || crypto.randomUUID(),
      public_id: uploaded.public_id,
      url: uploaded.url,
      name: item.name || file.originalname,
      caption: item.caption || '',
    });
  }

  // Maximum de 6 captures.
  if (screenshots.length > 6) {
    throw new ApiError(
      400,
      'Une entrée ne peut pas contenir plus de 6 captures.'
    );
  }

  update.screenshots = screenshots;

  // Blocs ordonnés (texte / image) : validés après construction des captures.
  if (req.body.blocks !== undefined) {
    update.blocks = buildBlocks(
      req.body.blocks,
      screenshots.map((s) => s.id)
    );
  }

  // --------------------------------------------------
  // Mise à jour MongoDB
  // --------------------------------------------------

  const updatedEntry = await JournalEntry.findOneAndUpdate(
    {
      _id: req.params.id,
      user: req.user._id,
    },
    update,
    {
      new: true,
      runValidators: true,
    }
  );

  // Suppression des anciennes images sur Cloudinary APRÈS mise à jour DB réussie.
  for (const screenshot of screenshotsToDelete) {
    if (screenshot.public_id) {
      await cloudinary.uploader.destroy(
        screenshot.public_id,
        {
          resource_type: 'image',
        }
      );
    }
  }

  res.json({
    success: true,
    data: updatedEntry,
  });
});

// DELETE /api/journal-entries/:id
const deleteJournalEntry = asyncHandler(async (req, res) => {
  const entry = await JournalEntry.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id,
  });

  if (!entry) {
    throw new ApiError(404, 'Entrée de journal introuvable.');
  }

  // Supprime également les images de Cloudinary.
  for (const screenshot of entry.screenshots || []) {
    if (screenshot.public_id) {
      await cloudinary.uploader.destroy(
        screenshot.public_id,
        {
          resource_type: 'image',
        }
      );
    }
  }

  res.json({
    success: true,
    data: {
      id: req.params.id,
    },
  });
});

module.exports = {
  getJournalEntries,
  getJournalEntryById,
  createJournalEntry,
  updateJournalEntry,
  deleteJournalEntry,
};
