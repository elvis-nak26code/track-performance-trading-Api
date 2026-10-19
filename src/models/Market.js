// Modèle Market : catalogue des marchés (actions, indices, forex, matières
// premières).
//  - Marchés de RÉFÉRENCE (isCustom: false, createdBy: null) : partagés entre
//    tous les utilisateurs, insérés via le seed (src/scripts/seedMarkets.js).
//  - Marchés PERSONNALISÉS (isCustom: true) : ajoutés par un utilisateur depuis
//    /marches, visibles UNIQUEMENT par lui (createdBy = son id).
const mongoose = require('mongoose');

const { Schema } = mongoose;

const marketSchema = new Schema(
  {
    symbol: {
      type: String,
      required: [true, 'Le symbole est requis.'],
      trim: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: [true, 'Le nom complet est requis.'],
      trim: true,
    },
    category: {
      type: String,
      enum: ['action', 'indice', 'forex', 'matiere-premiere', 'crypto', 'synthetique'],
      required: true,
    },
    // Classification comportementale : un actif peut cumuler plusieurs tags.
    tags: {
      type: [String],
      enum: ['risk-on', 'risk-off', 'actif-saisonnier', 'sensible-evenements'],
      default: [],
    },
    description: {
      type: String,
      required: [true, 'Une description du comportement est requise.'],
    },
    // true si ajouté manuellement par un utilisateur plutôt que par le seed initial.
    isCustom: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.createdBy;
      },
    },
  }
);

// Un même symbole ne peut exister qu'une fois par propriétaire : une seule fois
// dans le catalogue de référence (createdBy: null) et une seule fois par
// utilisateur pour ses marchés personnalisés. Deux utilisateurs peuvent donc
// avoir chacun leur propre marché "XYZ" sans se bloquer mutuellement.
marketSchema.index({ symbol: 1, createdBy: 1 }, { unique: true });
marketSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Market', marketSchema);
