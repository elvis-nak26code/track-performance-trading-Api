// Contrôleur d'authentification : inscription, connexion e-mail/mot de
// passe, et connexion Google. Chaque action réussie renvoie { user, token }
// pour que le frontend puisse stocker la session immédiatement (voir
// AuthContext.jsx côté client, qui persiste { user, token } et attache le
// token à chaque requête suivante).
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { generateToken } = require('../utils/generateToken');
const { verifyGoogleCredential } = require('../utils/googleAuth');
const emailService = require('../services/emailService');

// Crée l'entrée Subscription "essai" initiale et renvoie la réponse
// d'authentification standard (utilisé par register ET googleLogin).
async function createTrialSubscription(user) {
  await Subscription.create({
    user: user._id,
    planId: 'essai',
    status: 'active',
    startedAt: user.planStartedAt,
    amountUsd: 0,
    provider: 'none',
  });
}

function buildAuthResponse(user) {
  return {
    success: true,
    data: {
      user: user.toJSON(),
      token: generateToken(user),
    },
  };
}

// POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new ApiError(400, 'Nom, e-mail et mot de passe sont requis.');
  }
  if (password.length < 6) {
    throw new ApiError(400, 'Le mot de passe doit contenir au moins 6 caractères.');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new ApiError(409, 'Un compte existe déjà avec cet e-mail.');
  }

  const user = await User.create({
    name,
    email,
    passwordHash: password, // haché automatiquement par le hook pre('save') du modèle
    provider: 'email',
  });

  await createTrialSubscription(user);

  // E-mail de bienvenue (no-op si SMTP non configuré, ne bloque pas la réponse).
  emailService.sendWelcomeEmail(user).catch(() => {});

  res.status(201).json(buildAuthResponse(user));
});

// POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, 'E-mail et mot de passe sont requis.');
  }

  // .select('+passwordHash') : le champ est exclu par défaut dans le schéma.
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user || !(await user.comparePassword(password))) {
    throw new ApiError(401, 'E-mail ou mot de passe incorrect.');
  }

  res.json(buildAuthResponse(user));
});

// POST /api/auth/google  { credential }
const googleLogin = asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    throw new ApiError(400, 'Le jeton Google (credential) est requis.');
  }

  const googleProfile = await verifyGoogleCredential(credential);

  let user = await User.findOne({ email: googleProfile.email.toLowerCase() });
  let isNewUser = false;

  if (!user) {
    user = await User.create({
      name: googleProfile.name,
      email: googleProfile.email,
      provider: 'google',
      googleId: googleProfile.googleId,
      picture: googleProfile.picture,
    });
    isNewUser = true;
  } else if (!user.googleId) {
    // Un compte e-mail existait déjà avec cette adresse : on relie le compte
    // Google plutôt que de créer un doublon.
    user.googleId = googleProfile.googleId;
    user.picture = user.picture || googleProfile.picture;
    await user.save();
  }

  if (isNewUser) {
    await createTrialSubscription(user);
    // E-mail de bienvenue à la première inscription via Google (no-op sinon).
    emailService.sendWelcomeEmail(user).catch(() => {});
  }

  res.json(buildAuthResponse(user));
});

module.exports = { register, login, googleLogin };
