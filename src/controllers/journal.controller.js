
// Contrôleur JournalEntry : CRUD complet, filtré par utilisateur.
// Les trades liés sont toujours vérifiés pour appartenir à l'utilisateur courant.

const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const Trade = require('../models/Trade');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const cloudinary = require('../config/cloudinary');
const crypto = require('crypto');
const { MAX_SCREENSHOTS } = require('../middlewares/upload.middleware');

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

// Vérifie que les trades liés appartiennent bien à l'utilisateur. Les
// identifiants non-ObjectId (ex : UUID local d'un trade pas encore synchronisé)
// sont ignorés proprement : sinon Mongoose lèverait une CastError et
// empêcherait la création/mise à jour de l'entrée de journal.
async function resolveLinkedTrades(linkedTradeIds, userId) {
  if (!Array.isArray(linkedTradeIds) || linkedTradeIds.length === 0) {
    return [];
  }

  const validIds = linkedTradeIds.filter((id) => mongoose.isValidObjectId(id));

  if (validIds.length === 0) {
    return [];
  }

  const trades = await Trade.find({
    _id: { $in: validIds },
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

// Supprime une image Cloudinary sans jamais faire échouer la requête : à ce
// stade la base de données est déjà à jour, une panne Cloudinary ne doit donc
// pas renvoyer une erreur au client (qui réessaierait et obtiendrait un 404).
async function destroyImageQuietly(screenshot) {
  if (!screenshot || !screenshot.public_id) return;
  try {
    await cloudinary.uploader.destroy(screenshot.public_id, { resource_type: 'image' });
  } catch (error) {
    console.error('[cloudinary] Suppression impossible :', screenshot.public_id, error.message);
  }
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

  if (metadata.length > MAX_SCREENSHOTS) {
    throw new ApiError(
      400,
      `Une entrée ne peut pas contenir plus de ${MAX_SCREENSHOTS} captures.`
    );
  }

  const screenshots = [];

  // Les fichiers multipart correspondent UNIQUEMENT aux captures marquées
  // `isNew` (même convention que updateJournalEntry) : on aligne les métadonnées
  // sur ces seules captures pour éviter tout désalignement METADATA ↔ octets
  // quand l'entrée contient un mélange d'anciennes et de nouvelles images.
  const newMetadata = metadata.filter(
    (m) => m && m.isNew === true
  );

  for (let i = 0; i < (req.files || []).length; i++) {
    const file = req.files[i];

    const uploaded = await uploadImageToCloudinary(
      file,
      req.user._id.toString()
    );

    const item = newMetadata[i] || {};

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

  // Les captures ne sont touchées QUE si le client les mentionne (métadonnées
  // ou nouveaux fichiers). Sans cela (ex : simple modification du texte ou de
  // l'humeur), les captures existantes sont conservées telles quelles — avant
  // ce correctif, elles étaient toutes supprimées de Cloudinary et de la base.
  const metadataProvided = req.body.screenshotMetadata !== undefined;
  const hasNewFiles = (req.files || []).length > 0;

  let screenshotsToDelete = [];

  if (metadataProvided || hasNewFiles) {
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
    screenshotsToDelete = existingScreenshots.filter(
      (screenshot) => !keptIds.includes(screenshot.id)
    );

    // Conservation des anciennes captures
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

    // Upload des nouvelles captures
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

    // Maximum de captures par entrée.
    if (screenshots.length > MAX_SCREENSHOTS) {
      throw new ApiError(
        400,
        `Une entrée ne peut pas contenir plus de ${MAX_SCREENSHOTS} captures.`
      );
    }

    update.screenshots = screenshots;

    // Blocs ordonnés (texte / image) : validés après construction des captures.
    if (req.body.blocks !== undefined) {
      update.blocks = buildBlocks(
        req.body.blocks,
        screenshots.map((s) => s.id)
      );
    } else if (screenshotsToDelete.length > 0) {
      // Le client n'a pas renvoyé les blocs : on retire seulement ceux qui
      // pointaient vers une capture supprimée (évite des images "fantômes").
      const remainingIds = new Set(screenshots.map((s) => s.id));
      update.blocks = (entry.blocks || [])
        .filter((b) => b.type !== 'image' || remainingIds.has(b.screenshotId))
        .map((b) => (typeof b.toObject === 'function' ? b.toObject() : b));
    }
  } else if (req.body.blocks !== undefined) {
    // Blocs modifiés sans toucher aux captures : on valide contre les captures
    // actuelles de l'entrée.
    update.blocks = buildBlocks(
      req.body.blocks,
      (entry.screenshots || []).map((s) => s.id)
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

  if (!updatedEntry) {
    throw new ApiError(404, 'Entrée de journal introuvable.');
  }

  // Suppression des anciennes images sur Cloudinary APRÈS mise à jour DB réussie.
  for (const screenshot of screenshotsToDelete) {
    await destroyImageQuietly(screenshot);
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

  // Supprime également les images de Cloudinary (sans jamais faire échouer la
  // requête : l'entrée est déjà supprimée en base).
  for (const screenshot of entry.screenshots || []) {
    await destroyImageQuietly(screenshot);
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
