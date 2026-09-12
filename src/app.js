// Configuration de l'application Express : middlewares globaux (sécurité,
// CORS, compression, logs, parsing JSON) puis montage des routes API et
// gestion des erreurs. Séparé de server.js pour pouvoir importer `app` dans
// des tests automatisés sans démarrer un vrai serveur HTTP.
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const env = require('./config/env');
const apiRouter = require('./routes');
const { notFound, errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Sécurise les en-têtes HTTP par défaut (protection XSS, sniffing, etc.).
app.use(helmet());

// N'autorise que le frontend configuré à appeler l'API (voir FRONTEND_URL).
app.use(
  cors({
    origin: env.frontendUrl,
    credentials: true,
  })
);

// Compresse les réponses (gzip) : réduit la taille des réponses JSON,
// particulièrement utile pour les listes de trades qui peuvent être longues.
app.use(compression());

// Logs de requêtes HTTP, format concis en production, détaillé en dev.
app.use(morgan(env.isProduction ? 'combined' : 'dev'));

// Parsing du JSON envoyé par le frontend (fetch avec Content-Type: application/json).
// L'option `verify` conserve aussi le corps BRUT (req.rawBody) : indispensable pour
// vérifier la signature des webhooks Genius Pay sans le re-lire depuis le stream
// (déjà consommé par ce middleware).
app.use(
  express.json({
    limit: '2mb',
    verify(req, _res, buf) {
      req.rawBody = Buffer.isBuffer(buf) ? buf.toString('utf8') : (buf || '');
    },
  })
);

app.use('/api', apiRouter);

// 404 puis gestionnaire d'erreurs global : toujours en DERNIER, dans cet ordre.
app.use(notFound);
app.use(errorHandler);

module.exports = app;
