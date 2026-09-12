// Modèle Utilisateur : gère à la fois les comptes email/mot de passe et les
// comptes connectés via Google. Contient aussi les préférences de calcul
// (facteur R, risque par défaut) et l'état d'abonnement (forfait en cours),
// afin que le profil frontend (/profil) puisse tout lire en un seul appel.
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const { Schema } = mongoose;

const SETTINGS_DEFAULTS = {
  rValueDollars: 500,
  defaultRiskPercent: 1,
};

const userSchema = new Schema(
  {
    name: {
      type: String,
      required: [true, 'Le nom est requis.'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "L'e-mail est requis."],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Adresse e-mail invalide.'],
    },
    // Absent pour les comptes créés via Google (aucun mot de passe local).
    passwordHash: {
      type: String,
      select: false, // jamais renvoyé par défaut dans les requêtes
    },
    provider: {
      type: String,
      enum: ['email', 'google'],
      default: 'email',
    },
    googleId: {
      type: String,
      default: null,
    },
    picture: {
      type: String,
      default: null,
    },

    // Préférences de calcul (voir page /profil du frontend). Ces valeurs
    // alimentent le calculateur de risque de façon cohérente avec les
    // statistiques exprimées en R ailleurs dans l'application.
    settings: {
      rValueDollars: { type: Number, default: SETTINGS_DEFAULTS.rValueDollars, min: 0 },
      defaultRiskPercent: { type: Number, default: SETTINGS_DEFAULTS.defaultRiskPercent, min: 0 },
    },

    // État d'abonnement courant. Le forfait peut être : essai gratuit (7 j),
    // mensuel (30 j), annuel (365 j) ou "lifetime" (accès à vie accordé via
    // le code promo). La durée de chaque forfait est définie dans
    // plan.middleware.js (backend) et constants/plans.js (frontend).
    plan: {
      type: String,
      enum: ['essai', 'mensuel', 'annuel', 'lifetime'],
      default: 'essai',
    },
    planStartedAt: {
      type: Date,
      default: Date.now,
    },
    // Codes promo déjà utilisés par cet utilisateur (impose "une seule fois
    // par compte" pour le code qui offre un mois gratuit).
    promoCodesRedeemed: {
      type: [
        {
          code: { type: String },
          redeemedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    // Date du dernier e-mail de rappel d'expiration envoyé (null tant que le
    // rappel n'a pas été envoyé). Réinitialisé à chaque activation de forfait.
    expiryReminderSentAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // createdAt / updatedAt automatiques
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
      },
    },
  }
);

// Hash automatique du mot de passe avant sauvegarde, uniquement s'il a été
// modifié (évite de re-hasher un hash déjà stocké lors d'une simple mise à
// jour du profil qui ne touche pas au mot de passe).
userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('passwordHash') || !this.passwordHash) {
    return next();
  }
  const salt = await bcrypt.genSalt(10);
  this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
  next();
});

// Compare un mot de passe en clair avec le hash stocké.
userSchema.methods.comparePassword = function comparePassword(plainPassword) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plainPassword, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
