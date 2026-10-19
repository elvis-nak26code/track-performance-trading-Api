# Journal de Trading (BlackTracker) — Backend

API REST (Node.js + Express + MongoDB/Mongoose + JWT) du **Journal de Trading**.
**Le logiciel est entièrement gratuit** : il n'y a ni paiement, ni forfait, ni
tarif, ni période d'essai.

## Démarrage rapide

```bash
npm install
cp .env.example .env   # puis renseignez vos valeurs
npm run dev            # démarre avec nodemon
npm test               # tests d'isolation des données (sans base de données)
```

Le serveur écoute par défaut sur `http://localhost:5000`. Au démarrage, il
aligne les index de la collection `markets` et ajoute au catalogue les actifs de
référence manquants (`src/data/markets.seed.json`).

Prérequis : une instance MongoDB (locale ou Atlas) — voir `MONGODB_URI`.

## Variables d'environnement

Toutes documentées dans `.env.example` : `MONGODB_URI`, `JWT_SECRET`,
`GOOGLE_CLIENT_ID`, `FRONTEND_URL`, `CLOUDINARY_*` (captures d'écran), `SMTP_*`
(e-mails, optionnels).

## Isolation des données

- Trades, entrées de journal et stratégies appartiennent à **un seul
  utilisateur** : chaque requête est filtrée par `user = req.user._id` (lecture,
  modification, suppression) et le champ `user` envoyé par un client est ignoré.
- Les trades liés à une entrée de journal sont vérifiés (ils doivent appartenir
  au même utilisateur).
- Marchés : le catalogue de **référence** est partagé (lecture seule) ; les
  marchés **personnalisés** sont privés à leur créateur.
- Les captures d'écran sont rangées par utilisateur dans Cloudinary
  (`trading-journal/users/<id>`).

## Endpoints

Toutes les routes sauf `/api/auth/*` et `/api/health` exigent
`Authorization: Bearer <token>`.

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | Vérifie que l'API répond |
| POST | `/api/auth/register` · `/login` · `/google` | Inscription / connexion |
| POST | `/api/auth/forgot-password` · `/reset-password` | Mot de passe oublié |
| GET / PUT | `/api/users/me` | Profil / modifier le nom |
| PUT | `/api/users/me/settings` | Valeur de 1R et risque par défaut |
| GET / POST | `/api/trades` | Lister / créer un trade |
| POST | `/api/trades/bulk` | Import de plusieurs trades |
| GET / PUT / DELETE | `/api/trades/:id` | Lire / modifier / supprimer |
| GET / POST | `/api/journal-entries` | Lister / créer une entrée (multipart, captures) |
| GET / PUT / DELETE | `/api/journal-entries/:id` | Lire / modifier / supprimer |
| GET / POST | `/api/strategies` | Lister / créer |
| GET | `/api/strategies/active` | Stratégie active |
| GET / PUT / DELETE | `/api/strategies/:id` | Lire / modifier / supprimer |
| PUT | `/api/strategies/:id/activate` | Activer (une seule active à la fois) |
| GET / POST / DELETE | `/api/markets` | Catalogue de référence + mes marchés |

Réponses : `{ success: boolean, data?: ..., message?: ... }`.

## Nettoyage d'une base existante (optionnel)

Si votre base contient d'anciennes données de forfaits :

```bash
node scripts/cleanup-payment-data.js            # aperçu (ne modifie rien)
node scripts/cleanup-payment-data.js --confirm  # supprime les champs de forfait
                                                # et la collection "subscriptions"
```

## Sécurité

`helmet`, CORS restreint à `FRONTEND_URL`, `compression`, rate-limit sur
l'authentification, mots de passe hachés (bcrypt), jetons Google vérifiés
(signature, audience, e-mail vérifié). Le code de réinitialisation de mot de
passe n'est jamais renvoyé par l'API en production.
