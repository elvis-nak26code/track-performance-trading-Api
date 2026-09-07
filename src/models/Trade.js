// Modèle Trade : un trade appartient toujours à un utilisateur (isolation
// des données par compte). Le champ `date` est stocké en chaîne "yyyy-MM-dd"
// (et non en type Date) pour rester identique au format utilisé par le
// frontend (comparaisons de chaînes pour les filtres par période, pas de
// souci de fuseau horaire à gérer).
const mongoose = require('mongoose');

const { Schema } = mongoose;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const tradeSchema = new Schema(
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
    symbol: {
      type: String,
      required: [true, 'Le symbole est requis.'],
      trim: true,
      uppercase: true,
    },
    // Tableau et non valeur unique : Fondamentale et Price Action ne sont pas
    // des stratégies exclusives, elles peuvent être combinées sur un même trade.
    strategies: {
      type: [String],
      enum: ['fondamentale', 'price-action'],
      default: [],
    },
    direction: {
      type: String,
      enum: ['long', 'short'],
      required: true,
    },
    entryPrice: {
      type: Number,
      required: true,
    },
    exitPrice: {
      type: Number,
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: [1, 'La quantité doit être au moins 1.'],
    },
    // Multiple de risque (ex: +2.5 pour +2.5R, -1 pour -1R).
    r: {
      type: Number,
      required: true,
    },
    // Résultat en dollars du trade.
    pnl: {
      type: Number,
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.user; // l'utilisateur n'a pas besoin de revoir son propre id ici
      },
    },
  }
);

// Index composé utile pour les requêtes "mes trades triés par date"
// (la requête la plus fréquente de l'application).
tradeSchema.index({ user: 1, date: -1 });

module.exports = mongoose.model('Trade', tradeSchema);
