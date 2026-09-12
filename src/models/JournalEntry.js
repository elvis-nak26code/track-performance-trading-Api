// Modèle JournalEntry : entrée de journal de trading. Liée à un instrument
// (et non plus à un titre libre, conformément au frontend) et pouvant
// référencer un ou plusieurs trades du même utilisateur.
const mongoose = require('mongoose');

const { Schema } = mongoose;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Sous-document : une capture d'écran avec titre/légende optionnel.
// `url` peut être une URL classique (hébergement externe / futur endpoint
// d'upload) ; le stockage de fichiers binaires n'est volontairement pas
// implémenté ici (hors périmètre de cette première version du backend).
const screenshotSchema = new Schema(
  {
    id: {
      type: String,
      required: true,
    },

    public_id: {
      type: String,
      required: true,
    },

    url: {
      type: String,
      required: true,
    },

    name: {
      type: String,
      default: '',
    },

    caption: {
      type: String,
      default: '',
    },
  },
  { _id: false }
);

// Sous-document : un bloc ordonné de l'entrée de journal. Permet d'alterner
// texte et images dans l'ordre voulu (le texte concerné suivi de son image).
// - type "text" : le contenu est dans `content`
// - type "image" : référence l'id d'une capture du tableau `screenshots`
const blockSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['text', 'image'],
      required: true,
    },

    content: {
      type: String,
      default: '',
    },

    screenshotId: {
      type: String,
      default: '',
    },

    // Largeur (px) choisie par l'utilisateur lors du redimensionnement de
    // l'image sur la page. Absente si l'image est en pleine largeur.
    width: {
      type: Number,
    },
  },
  { _id: false }
);


const journalEntrySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: [true, 'La date est requise (format yyyy-MM-dd).'],
      match: [DATE_REGEX, 'Le format de date attendu est yyyy-MM-dd.'],
      index: true,
    },
    // Instrument concerné par l'entrée (remplace l'ancien champ "titre" libre).
    instrument: {
      type: String,
      required: [true, "L'instrument concerné est requis."],
      trim: true,
    },
    mood: {
      type: String,
      enum: ['calme', 'confiant', 'frustre', 'avide', 'craintif', 'tilte'],
      required: true,
    },
    text: {
      type: String,
      default: '',
    },
    // Blocs ordonnés (texte / image) permettant d'alterner les sections de
    // texte avec leurs captures. Anciennes entrées sans `blocks` : on utilise
    // encore `text` et `screenshots`.
    blocks: {
      type: [blockSchema],
      default: [],
    },
    screenshots: {
      type: [screenshotSchema],
      default: [],
    },
    // Trades liés (doivent appartenir au même utilisateur, vérifié dans le contrôleur).
    linkedTrades: [
      {
        type: Schema.Types.ObjectId,
        ref: 'Trade',
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        // Exposé sous le même nom que dans le frontend (linkedTradeIds),
        // en tableau de chaînes plutôt que d'ObjectId Mongoose.
        ret.linkedTradeIds = (ret.linkedTrades || []).map((t) => t.toString());
        delete ret._id;
        delete ret.__v;
        delete ret.user;
        delete ret.linkedTrades;
      },
    },
  }
);

journalEntrySchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
