# Journal de Trading — Backend

API REST (Node.js + Express + MongoDB/Mongoose + JWT) pour l'application
**Journal de Trading**. Conçue pour être branchée directement sur le
frontend existant : il suffit de passer `VITE_USE_MOCK_DATA=false` et de
renseigner `VITE_API_BASE_URL=http://localhost:5000/api` côté frontend.

## Démarrage rapide

```bash
npm install
cp .env.example .env   # puis renseignez vos valeurs (voir ci-dessous)
npm run seed:markets   # peuple la collection "markets" (une seule fois)
npm run dev             # démarre avec nodemon (rechargement automatique)
```

Le serveur écoute par défaut sur `http://localhost:5000`.

Prérequis : une instance MongoDB accessible (locale ou MongoDB Atlas) — voir
`MONGODB_URI` dans `.env.example`.

## Variables d'environnement

Toutes les variables sont documentées avec des commentaires en français
dans `.env.example`. Les plus importantes :

| Variable | Rôle |
|---|---|
| `MONGODB_URI` | Chaîne de connexion MongoDB |
| `JWT_SECRET` | Clé de signature des tokens JWT (à générer aléatoirement) |
| `GOOGLE_CLIENT_ID` | Doit être identique à celui du frontend, pour vérifier les connexions Google |
| `FRONTEND_URL` | Origine autorisée en CORS |
| `GENIUS_PAY_*` | Réservées à l'intégration future du paiement (non utilisées pour l'instant) |

## Structure du projet

```
src/
  config/       chargement des variables d'env + connexion MongoDB
  models/       schémas Mongoose (User, Trade, JournalEntry, Market, Subscription)
  middlewares/  authentification JWT, gestion centralisée des erreurs
  controllers/  logique métier de chaque ressource
  routes/       déclaration des endpoints Express
  utils/        JWT, vérification Google, ApiError, asyncHandler
  data/         données de seed (catalogue de marchés)
  scripts/      scripts exécutables (seed:markets)
  app.js        configuration Express (middlewares + montage des routes)
  server.js     point d'entrée (connexion DB + démarrage du serveur)
```

## Authentification

- **E-mail / mot de passe** : `POST /api/auth/register`, `POST /api/auth/login`.
  Le mot de passe est haché avec bcrypt avant stockage.
- **Google** : `POST /api/auth/google` avec `{ credential }` (le jeton renvoyé
  par le bouton Google du frontend). Le backend vérifie la signature ET
  l'audience du jeton auprès de Google (pas un simple décodage).
- Chaque connexion réussie renvoie `{ user, token }`. Le frontend doit
  ensuite envoyer `Authorization: Bearer <token>` sur toutes les requêtes
  protégées.

## Endpoints disponibles

Toutes les routes sauf `/api/auth/*`, `/api/health` et
`/api/subscriptions/plans` nécessitent l'en-tête `Authorization: Bearer <token>`.

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/health` | Vérifie que l'API répond |
| POST | `/api/auth/register` | Créer un compte e-mail/mot de passe |
| POST | `/api/auth/login` | Se connecter |
| POST | `/api/auth/google` | Se connecter avec Google |
| GET | `/api/users/me` | Profil de l'utilisateur connecté |
| PUT | `/api/users/me` | Modifier le nom |
| PUT | `/api/users/me/settings` | Modifier la valeur de 1R et le risque par défaut |
| GET | `/api/trades` | Liste des trades de l'utilisateur |
| POST | `/api/trades` | Créer un trade |
| POST | `/api/trades/bulk` | Créer plusieurs trades (import CSV) |
| GET/PUT/DELETE | `/api/trades/:id` | Lire / modifier / supprimer un trade |
| GET | `/api/journal-entries` | Liste des entrées de journal |
| POST | `/api/journal-entries` | Créer une entrée |
| GET/PUT/DELETE | `/api/journal-entries/:id` | Lire / modifier / supprimer une entrée |
| GET | `/api/markets` | Catalogue de référence des marchés |
| POST | `/api/markets` | Ajouter un marché manuellement |
| GET | `/api/subscriptions/plans` | Liste des forfaits (public) |
| GET | `/api/subscriptions/me` | Forfait courant + jours restants |
| POST | `/api/subscriptions/choose` | Choisir un forfait (mock, en attendant Genius Pay) |

Toutes les réponses suivent le format `{ success: boolean, data?: ..., message?: ... }`.

## Intégration future de Genius Pay

Le modèle `Subscription` et le contrôleur `subscription.controller.js`
contiennent déjà la structure nécessaire (voir les commentaires dans ces
fichiers). Il restera à :
1. Initier un paiement via l'API Genius Pay dans `choosePlan` pour les
   forfaits payants (au lieu d'activer le forfait immédiatement).
2. Ajouter un endpoint webhook qui active réellement le forfait à la
   confirmation du paiement.

## Sécurité et performance

- `helmet` (en-têtes HTTP sécurisés), `cors` (origine restreinte au
  frontend), `compression` (réponses gzip), `express-rate-limit` (anti
  bruteforce sur l'authentification).
- Toutes les routes de données sont filtrées par `user` : impossible pour un
  compte de lire ou modifier les données d'un autre.
- `asyncHandler` + middleware d'erreurs centralisé : pas de try/catch
  répété, réponses d'erreur cohérentes.
