// Modèle Subscription : historique des changements de forfait / paiements.
// Le paiement réel via Genius Pay n'est PAS encore intégré (à faire plus
// tard, voir subscription.controller.js) — ce modèle existe déjà pour que la
// structure de données soit prête : chaque changement de forfait (y compris
// les changements "gratuits" comme le passage à l'essai) crée une entrée ici,
// ce qui donne un historique exploitable dès que le paiement sera branché.
const mongoose = require('mongoose');

const { Schema } = mongoose;

const subscriptionSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    planId: {
      type: String,
      enum: ['essai', 'mensuel', 'annuel'],
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled'],
      default: 'active',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    amountUsd: {
      type: Number,
      default: 0,
    },
    // Réservé à l'intégration Genius Pay : identifiant de la transaction côté
    // fournisseur de paiement, et charge utile brute du webhook pour audit.
    provider: {
      type: String,
      enum: ['none', 'genius_pay'],
      default: 'none',
    },
    providerReference: {
      type: String,
      default: null,
    },
    rawProviderPayload: {
      type: Schema.Types.Mixed,
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
      },
    },
  }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
