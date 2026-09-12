// Service d'envoi d'e-mails transactionnels (bienvenue, confirmation
// d'abonnement, rappel d'expiration) via SMTP (nodemailer).
//
// IMPORTANT : l'application doit continuer à fonctionner même si l'e-mail
// n'est pas configuré. Tant que SMTP n'est pas renseigné (ou
// EMAIL_ENABLED !== "true"), `sendEmail` est un no-op : il journalise
// simplement l'intention sans tenter de connexion SMTP.
//
// Variables d'environnement (à remplir plus tard par l'exploitant) :
//   EMAIL_ENABLED=true
//   SMTP_HOST=smtp.votre-fai.fr
//   SMTP_PORT=587
//   SMTP_SECURE=false            (true si le port SMTP utilise TLS de bout en bout)
//   SMTP_USER=no-reply@exemple.fr
//   SMTP_PASS=********************
//   EMAIL_FROM="BlackTracker <no-reply@exemple.fr>"
const nodemailer = require('nodemailer');
const env = require('../config/env');

const FROM = env.email.from || (env.email.user ? `BlackTracker <${env.email.user}>` : 'BlackTracker <no-reply@localhost>');

/** L'e-mail n'est actif que si configuré explicitement ET complet. */
function isEmailConfigured() {
  return env.email.enabled && Boolean(env.email.host && env.email.user && env.email.pass);
}

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: env.email.host,
    port: env.email.port,
    secure: env.email.secure, // true pour 465 (TLS direct), false pour 587 (STARTTLS)
    auth: { user: env.email.user, pass: env.email.pass },
  });
  return transporter;
}

// No-op sûr : journalise dans la console en mode dev pour faciliter le debug,
// renvoie toujours { skipped: true }.
async function sendEmail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    if (env.nodeEnv === 'development') {
      console.log(`[email] (non configuré, envoi ignoré) À : ${to} — ${subject}`);
      console.log(`[email]    Contenu : ${(text || '').split('\n')[0]}`);
    }
    return { skipped: true };
  }

  const mail = { from: FROM, to, subject, text, html };
  const info = await getTransporter().sendMail(mail);
  console.log(`[email] Envoyé à ${to} : ${subject} (${info.messageId})`);
  return info;
}

/** E-mail de bienvenue, envoyé à l'inscription (email ou Google). */
function sendWelcomeEmail(user) {
  return sendEmail({
    to: user.email,
    subject: 'Bienvenue sur BlackTracker 🎉',
    text: [
      `Bonjour ${user.name || user.email},`,
      '',
      'Bienvenue sur BlackTracker, votre journal de trading.',
      'Votre essai gratuit de 7 jours vient d\'être activé : vous pouvez',
      'enregistrer vos trades, tenir votre journal et consulter vos',
      'statistiques dès maintenant.',
      '',
      'Bonne chance et bons trades !',
      '— L\'équipe BlackTracker',
    ].join('\n'),
  });
}

/** E-mail de confirmation quand un abonnement (payant, gratuit ou promo) s'active. */
function sendSubscriptionConfirmationEmail(user, plan, source) {
  const sourceLabel =
    source === 'promo'
      ? 'via un code promo'
      : source === 'free'
        ? 'via l\'essai gratuit'
        : 'après votre paiement';
  return sendEmail({
    to: user.email,
    subject: `Votre forfait « ${plan.label} » est actif ✅`,
    text: [
      `Bonjour ${user.name || user.email},`,
      '',
      `Votre forfait « ${plan.label} » est maintenant actif ${sourceLabel}.`,
      plan.durationDays && Number.isFinite(plan.durationDays)
        ? `Il vous donne accès à toutes les fonctionnalités pendant ${plan.durationDays} jours.`
        : 'Il vous donne accès à toutes les fonctionnalités sans limite de temps.',
      '',
      'Rendez-vous sur votre tableau de bord pour continuer à trader.',
      '— L\'équipe BlackTracker',
    ].join('\n'),
  });
}

/** Rappel quand l'abonnement approche de son expiration (envoyé par le job). */
function sendExpiryReminderEmail(user, plan, daysRemaining) {
  const dayText = daysRemaining === 1 ? 'dernier jour' : `${daysRemaining} jours`;
  return sendEmail({
    to: user.email,
    subject: `Votre forfait expire dans ${dayText} ⏳`,
    text: [
      `Bonjour ${user.name || user.email},`,
      '',
      `Votre forfait « ${plan.label} » expire dans ${dayText}.`,
      'Pour ne pas interrompre votre suivi, renouvelez votre abonnement',
      'dès maintenant depuis la page Tarifs.',
      '',
      'Vos données restent enregistrées, mais vous ne pourrez plus ajouter',
      'de nouvelles entrées une fois le forfait expiré.',
      '',
      '— L\'équipe BlackTracker',
    ].join('\n'),
  });
}

module.exports = {
  isEmailConfigured,
  sendWelcomeEmail,
  sendSubscriptionConfirmationEmail,
  sendExpiryReminderEmail,
};