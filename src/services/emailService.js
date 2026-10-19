// Service d'envoi d'e-mails transactionnels (bienvenue, réinitialisation du
// mot de passe) via SMTP (nodemailer).
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
      'Le logiciel est entièrement gratuit : vous pouvez enregistrer vos',
      'trades, tenir votre journal et consulter vos statistiques dès',
      'maintenant, sans limite de durée.',
      '',
      'Bonne chance et bons trades !',
      '— L\'équipe BlackTracker',
    ].join('\n'),
  });
}

/**
 * E-mail de réinitialisation du mot de passe (mot de passe oublié). Le code
 * à 6 chiffres n'est jamais renvoyé par l'API en production (voir
 * auth.controller.js).
 */
function sendPasswordResetEmail(user, code) {
  return sendEmail({
    to: user.email,
    subject: 'Réinitialisation de votre mot de passe 🔑',
    text: [
      `Bonjour ${user.name || user.email},`,
      '',
      'Une demande de réinitialisation de mot de passe vient d\'être faite',
      'pour votre compte BlackTracker.',
      '',
      `Votre code de vérification : ${code}`,
      '',
      'Ce code est valable 30 minutes.',
      'Si vous n\'êtes pas à l\'origine de cette demande, ignorez simplement',
      'cet e-mail et votre mot de passe restera inchangé.',
      '',
      '— L\'équipe BlackTracker',
    ].join('\n'),
  });
}

module.exports = {
  isEmailConfigured,
  sendWelcomeEmail,
  sendPasswordResetEmail,
};