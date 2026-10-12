// Modèle Strategy : décrit une stratégie de trading (règles, limites de
// risque, cadre de session) et sa checklist pré-trade personnalisable.
// Une seule stratégie par utilisateur peut être "active" à la fois ; la
// checklist affichée dans l'application est celle de la stratégie active.
const mongoose = require('mongoose');

const { Schema } = mongoose;

const checklistItemSchema = new Schema(
  {
    // Identifiant stable pour la persistance des cases cochées côté client.
    id: {
      type: String,
      required: true,
    },
    label: {
      type: String,
      required: true,
      trim: true,
    },
    enabled: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const strategySchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Le nom de la stratégie est requis.'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    rules: {
      type: [String],
      default: [],
    },
    config: {
      // Risque maximum accepté par trade, en % du compte.
      maxRiskPerTradePct: {
        type: Number,
        min: [0, 'Le risque par trade ne peut pas être négatif.'],
        default: 1,
      },
      // Ratio récompense/risque minimum demandé avant de prendre un trade.
      minRR: {
        type: Number,
        min: [0, 'Le ratio R minimum ne peut pas être négatif.'],
        default: 1.5,
      },
      // Perte maximum acceptée sur une journée, en % du compte.
      maxDailyLossPct: {
        type: Number,
        min: [0, 'La perte journalière maximum ne peut pas être négative.'],
        default: 3,
      },
      // Créneaux de session (format "HH:mm"), vide si la stratégie n'est pas
      // contrainte à une période précise.
      sessionStart: {
        type: String,
        default: '',
      },
      sessionEnd: {
        type: String,
        default: '',
      },
      timeframes: {
        type: [String],
        default: [],
      },
      symbols: {
        type: [String],
        default: [],
      },
      directions: {
        type: [String],
        enum: ['long', 'short'],
        default: [],
      },
    },
    // Checklist pré-trade, 100 % personnalisable par l'utilisateur.
    checklistItems: {
      type: [checklistItemSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.user;
      },
    },
  }
);

strategySchema.index({ user: 1, isActive: 1 });

module.exports = mongoose.model('Strategy', strategySchema);