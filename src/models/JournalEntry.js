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
    url: { type: String, required: true },
    name: { type: String, default: '' },
    caption: { type: String, default: '' },
  },
  { _id: false }
);
// On garde tout de même un identifiant stable côté client.
screenshotSchema.add({ id: { type: String, required: true } });

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
      required: [true, "Le texte d'analyse est requis."],
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
