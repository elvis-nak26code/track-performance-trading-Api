const multer = require('multer');

const storage = multer.memoryStorage();

const upload = multer({
  storage,

  limits: {
    files: 6,
    fileSize: 10 * 1024 * 1024, // 10 Mo maximum par image
  },

  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Seules les images sont autorisées.'));
    }

    cb(null, true);
  },
});

module.exports = upload;