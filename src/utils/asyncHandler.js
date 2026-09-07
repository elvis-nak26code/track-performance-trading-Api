// Enveloppe les fonctions de contrôleur async pour transmettre
// automatiquement toute erreur (rejet de Promise) au middleware
// errorHandler, sans avoir à écrire un try/catch dans chaque contrôleur.
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
