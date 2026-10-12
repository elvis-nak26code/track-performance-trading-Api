const multer = require('multer');
const ApiError = require('../utils/ApiError');

// Nombre maximal de captures d'écran par entrée de journal et taille maximale
// par image. Le frontend (JournalEntryForm) et le serveur local de bureau
// (desktop/src/server/server.js) doivent rester en ligne avec ces valeurs.
const MAX_SCREENSHOTS = 20;
const MAX_IMAGE_SIZE_BYTES = 20 * 1024 * 1024; // 20 Mo maximum par image

const storage = multer.memoryStorage();

const upload = multer({
  storage,

  limits: {
    files: MAX_SCREENSHOTS,
    fileSize: MAX_IMAGE_SIZE_BYTES,
  },

  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new ApiError(400, 'Seules les images sont autorisées.'));
    }

    cb(null, true);
  },
});

module.exports = upload;
module.exports.MAX_SCREENSHOTS = MAX_SCREENSHOTS;
module.exports.MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_BYTES;