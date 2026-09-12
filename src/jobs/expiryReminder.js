// Job de rappel d'expiration d'abonnement.
//
// Parcourt les utilisateurs dont le forfait expire bientôt (≤ 3 jours restants)
// et leur envoie UN rappel par période d'activation (champ
// User.expiryReminderSentAt, réinitialisé à chaque activation de forfait).
//
// L'exécution est nettoyée : jamais deux parcours simultanés, et les erreurs
// d'envoi (ou l'absence de SMTP) ne font pas tomber le serveur.
const User = require('../models/User');
const { getPlan } = require('../constants/plans');
const { getDaysRemaining } = require('../middlewares/plan.middleware');
const emailService = require('../services/emailService');

const REMIND_WHEN_DAYS_LEFT = 3; // rappel dès qu'il reste 1 à 3 jours
const REMINDER_STRATEGY = 'single'; // un seul rappel par activation

let running = false;

async function runExpiryReminders() {
  if (running) return; // évite les chevauchements si le job précédent traîne
  running = true;

  try {
    // On exclut les comptes "lifetime" (accès à vie) : ils n'expirent jamais.
    const users = await User.find({ plan: { $ne: 'lifetime' } });

    let reminded = 0;
    for (const user of users) {
      const daysRemaining = getDaysRemaining(user);
      if (daysRemaining <= 0 || daysRemaining > REMIND_WHEN_DAYS_LEFT) continue;

      // Déjà rappelé pendant cette période d'activation ?
      if (user.expiryReminderSentAt) continue;

      const plan = getPlan(user.plan);
      const result = await emailService.sendExpiryReminderEmail(user, plan, daysRemaining);
      // On ne marque le rappel comme envoyé que s'il l'a réellement été
      // (si SMTP n'est pas configuré, on retentera au prochain passage).
      if (!result || result.skipped) continue;

      user.expiryReminderSentAt = new Date();
      await user.save();
      reminded += 1;
    }

    if (reminded > 0) {
      console.log(`[rappel-expiration] ${reminded} rappel(s) envoyé(s).`);
    }
  } catch (error) {
    console.error('[rappel-expiration] Erreur :', error.message);
  } finally {
    running = false;
  }
}

module.exports = { runExpiryReminders };