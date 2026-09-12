// Modèle Market : catalogue de référence des marchés (actions, indices,
// forex, matières premières), partagé entre tous les utilisateurs (ce n'est
// pas une donnée privée comme les trades). Les entrées de base sont insérées
// via le script src/scripts/seedMarkets.js ; les utilisateurs peuvent en
// ajouter manuellement depuis /marches (isCustom: true).
const mongoose = require('mongoose');

const { Schema } = mongoose;

const marketSchema = new Schema(
  {
    symbol: {
      type: String,
      required: [true, 'Le symbole est requis.'],
      trim: true,
      uppercase: true,
      unique: true,
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

module.exports = mongoose.model('Market', marketSchema);
