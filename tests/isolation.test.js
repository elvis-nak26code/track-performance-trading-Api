// Tests d'isolation des données et de suppression du paiement.
// Aucune base de données requise : les modèles Mongoose sont remplacés par des
// "espions" qui enregistrent les filtres reçus. Lancer : npm test
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/test_unused';
process.env.JWT_SECRET = 'secret-de-test';
process.env.FRONTEND_URL = 'http://localhost:5173';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const env = require('../src/config/env');
const User = require('../src/models/User');
const Trade = require('../src/models/Trade');
const JournalEntry = require('../src/models/JournalEntry');
const Strategy = require('../src/models/Strategy');
const Market = require('../src/models/Market');
const cloudinary = require('../src/config/cloudinary');
const app = require('../src/app');

const idA = new mongoose.Types.ObjectId();
const idB = new mongoose.Types.ObjectId();
const users = {
  [idA]: { _id: idA, email: 'a@test.com', name: 'A' },
  [idB]: { _id: idB, email: 'b@test.com', name: 'B' },
};
const tokenOf = (id) => jwt.sign({ sub: String(id) }, env.jwtSecret);

// ---- espions ---------------------------------------------------------------
const calls = [];
const spy = (Model, name, ret) => {
  Model[name] = (...args) => {
    calls.push({ model: Model.modelName, method: name, args });
    const value = typeof ret === 'function' ? ret(...args) : ret;
    const p = Promise.resolve(value);
    p.sort = () => p; // permet find(...).sort(...)
    p.select = () => p;
    return p;
  };
};
User.findById = (id) => Promise.resolve(users[String(id)] || null);
for (const M of [Trade, JournalEntry, Strategy]) {
  for (const m of ['find', 'findOne', 'findOneAndUpdate', 'findOneAndDelete', 'countDocuments', 'updateMany']) {
    spy(M, m, m === 'find' ? [] : m === 'countDocuments' ? 2 : null);
  }
  spy(M, 'create', (doc) => ({ ...doc, toJSON() { return this; }, save: async () => {} }));
  spy(M, 'insertMany', (docs) => docs);
}
spy(Market, 'find', []);
spy(Market, 'findOne', null);
spy(Market, 'create', (d) => d);

let server;
let base;
test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(() => server.close());

const api = (path, { method = 'GET', as, body } = {}) =>
  fetch(base + path, {
    method,
    headers: {
      ...(as ? { Authorization: `Bearer ${tokenOf(as)}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
const last = (model, method) => [...calls].reverse().find((c) => c.model === model && c.method === method);
const sameId = (a, b) => String(a) === String(b);

// ---- 1. Authentification obligatoire ---------------------------------------
test('toutes les routes de données refusent une requête sans jeton (401)', async () => {
  const routes = [
    ['GET', '/trades'], ['POST', '/trades'], ['POST', '/trades/bulk'], ['GET', '/trades/abc'],
    ['PUT', '/trades/abc'], ['DELETE', '/trades/abc'],
    ['GET', '/journal-entries'], ['POST', '/journal-entries'], ['GET', '/journal-entries/abc'],
    ['PUT', '/journal-entries/abc'], ['DELETE', '/journal-entries/abc'],
    ['GET', '/strategies'], ['GET', '/strategies/active'], ['POST', '/strategies'],
    ['PUT', '/strategies/abc'], ['PUT', '/strategies/abc/activate'], ['DELETE', '/strategies/abc'],
    ['GET', '/markets'], ['POST', '/markets'], ['DELETE', '/markets/abc'],
    ['GET', '/users/me'], ['PUT', '/users/me'], ['PUT', '/users/me/settings'],
  ];
  for (const [method, path] of routes) {
    const res = await api(path, { method });
    assert.equal(res.status, 401, `${method} ${path} devrait renvoyer 401`);
  }
});

// ---- 2. Trades : chaque requête est filtrée par utilisateur ----------------
test('trades : lecture / modification / suppression filtrées par utilisateur', async () => {
  for (const [uid, other] of [[idA, idB], [idB, idA]]) {
    await api('/trades', { as: uid });
    assert.ok(sameId(last('Trade', 'find').args[0].user, uid));
    assert.ok(!sameId(last('Trade', 'find').args[0].user, other));

    const tid = new mongoose.Types.ObjectId();
    await api(`/trades/${tid}`, { as: uid });
    assert.ok(sameId(last('Trade', 'findOne').args[0].user, uid));
    await api(`/trades/${tid}`, { as: uid, method: 'PUT', body: { pnl: 5 } });
    assert.ok(sameId(last('Trade', 'findOneAndUpdate').args[0].user, uid));
    await api(`/trades/${tid}`, { as: uid, method: 'DELETE' });
    assert.ok(sameId(last('Trade', 'findOneAndDelete').args[0].user, uid));
  }
});

test("trades : impossible d'écrire pour un autre utilisateur (champ user ignoré)", async () => {
  await api('/trades', { as: idA, method: 'POST', body: { user: String(idB), symbol: 'EURUSD', pnl: 1 } });
  assert.ok(sameId(last('Trade', 'create').args[0].user, idA));
  await api('/trades/bulk', { as: idA, method: 'POST', body: { trades: [{ user: String(idB), symbol: 'X' }] } });
  assert.ok(last('Trade', 'insertMany').args[0].every((d) => sameId(d.user, idA)));
});

// ---- 3. Journal et stratégies ----------------------------------------------
test('journal et stratégies : toujours filtrés par utilisateur', async () => {
  const jid = new mongoose.Types.ObjectId();
  await api('/journal-entries', { as: idA });
  assert.ok(sameId(last('JournalEntry', 'find').args[0].user, idA));
  await api(`/journal-entries/${jid}`, { as: idB });
  assert.ok(sameId(last('JournalEntry', 'findOne').args[0].user, idB));
  await api(`/journal-entries/${jid}`, { as: idA, method: 'DELETE' });
  assert.ok(sameId(last('JournalEntry', 'findOneAndDelete').args[0].user, idA));

  await api('/strategies', { as: idA });
  assert.ok(sameId(last('Strategy', 'find').args[0].user, idA));
  await api('/strategies/active', { as: idB });
  assert.ok(sameId(last('Strategy', 'findOne').args[0].user, idB));
});

test("journal : trades liés d'un autre utilisateur refusés (filtre user sur Trade.find)", async () => {
  const foreignTrade = new mongoose.Types.ObjectId();
  await api('/journal-entries', {
    as: idA, method: 'POST',
    body: { date: '2026-01-01', instrument: 'EURUSD', mood: 'calme', linkedTradeIds: JSON.stringify([String(foreignTrade)]) },
  });
  const q = last('Trade', 'find').args[0];
  assert.ok(sameId(q.user, idA));
});

test('journal : une modification sans captures ne supprime AUCUNE capture', async () => {
  const entry = {
    _id: new mongoose.Types.ObjectId(),
    screenshots: [{ id: 's1', public_id: 'pid1', url: 'u1' }],
    blocks: [],
  };
  JournalEntry.findOne = () => Promise.resolve(entry);
  JournalEntry.findOneAndUpdate = (...args) => { calls.push({ model: 'JournalEntry', method: 'findOneAndUpdate', args }); return Promise.resolve({ ok: true }); };
  const destroyed = [];
  cloudinary.uploader.destroy = async (pid) => { destroyed.push(pid); };

  const res = await api(`/journal-entries/${entry._id}`, { as: idA, method: 'PUT', body: { mood: 'calme', text: 'modifié' } });
  assert.equal(res.status, 200);
  const update = last('JournalEntry', 'findOneAndUpdate').args[1];
  assert.equal('screenshots' in update, false, "le champ screenshots ne doit pas être réécrit");
  assert.deepEqual(destroyed, [], 'aucune image ne doit être supprimée de Cloudinary');
});

test('journal : une suppression explicite de capture reste prise en compte', async () => {
  const entry = {
    _id: new mongoose.Types.ObjectId(),
    screenshots: [{ id: 's1', public_id: 'pid1', url: 'u1' }],
    blocks: [],
  };
  JournalEntry.findOne = () => Promise.resolve(entry);
  JournalEntry.findOneAndUpdate = (...args) => { calls.push({ model: 'JournalEntry', method: 'findOneAndUpdate', args }); return Promise.resolve({ ok: true }); };
  const destroyed = [];
  cloudinary.uploader.destroy = async (pid) => { destroyed.push(pid); };

  await api(`/journal-entries/${entry._id}`, {
    as: idA, method: 'PUT',
    body: { screenshotMetadata: JSON.stringify([]) },
  });
  assert.deepEqual(last('JournalEntry', 'findOneAndUpdate').args[1].screenshots, []);
  assert.deepEqual(destroyed, ['pid1']);
});

// ---- 4. Marchés : catalogue de référence partagé, marchés perso privés -----
test('marchés : un utilisateur ne voit que la référence + SES marchés', async () => {
  await api('/markets', { as: idA });
  const q = last('Market', 'find').args[0];
  const json = JSON.stringify(q);
  assert.ok(json.includes('"isCustom":false'));
  assert.ok(json.includes(String(idA)));
  assert.ok(!json.includes(String(idB)));
});

test("marchés : impossible de supprimer le marché personnalisé d'un autre", async () => {
  const mid = new mongoose.Types.ObjectId();
  Market.findById = () => Promise.resolve({ _id: mid, isCustom: true, createdBy: idB });
  const res = await api(`/markets/${mid}`, { as: idA, method: 'DELETE' });
  assert.equal(res.status, 404);
});

// ---- 5. Paiement / tarifs supprimés ----------------------------------------
test('paiement et tarifs : plus aucune route /subscriptions', async () => {
  for (const [method, path] of [
    ['GET', '/subscriptions/plans'], ['GET', '/subscriptions/me'], ['POST', '/subscriptions/choose'],
    ['POST', '/subscriptions/checkout'], ['POST', '/subscriptions/redeem'], ['POST', '/subscriptions/webhook'],
  ]) {
    const res = await api(path, { method, as: idA });
    assert.equal(res.status, 404, `${method} ${path} doit être supprimée (404)`);
  }
});

test('le profil utilisateur ne contient plus de notion de forfait', () => {
  const paths = Object.keys(User.schema.paths);
  for (const forbidden of ['plan', 'planStartedAt', 'promoCodesRedeemed', 'expiryReminderSentAt']) {
    assert.ok(!paths.includes(forbidden), `${forbidden} ne doit plus exister`);
  }
});

// ---- 6. Sécurité du mot de passe oublié ------------------------------------
test('mot de passe oublié : le code n\'est jamais renvoyé en production', async () => {
  env.isProduction = true;
  const fakeUser = { setResetCode: async () => '123456', save: async () => {}, email: 'a@test.com', name: 'A' };
  User.findOne = () => Promise.resolve(fakeUser);
  const res = await api('/auth/forgot-password', { method: 'POST', body: { email: 'a@test.com' } });
  const json = await res.json();
  assert.equal(res.status, 200);
  assert.equal(json.data.code, undefined);
  env.isProduction = false;
});
