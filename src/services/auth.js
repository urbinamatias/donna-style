// Servicio de autenticación del panel (Fase 6a, design.md D1/D4). Un único
// admin en todo el sistema (§1 de prompt.md) — no hay registro público, el
// alta corre por `db/scripts/create-admin.js`.
//
// `bcryptjs` (puro JS, sin binario nativo) en vez de `bcrypt` nativo: mismo
// motivo que ya documenta CLAUDE.md §5 para `sharp` — un binario nativo
// compilado en WSL rompe cuando Windows corre `npm install` sobre la misma
// carpeta. `bcryptjs` no compila nada, así que el problema no existe.
const bcrypt = require('bcryptjs');
const defaultAdminUsersModel = require('../models/admin-users');

const COST = 12;

// Hash dummy fijo, generado una sola vez, para que "email no existe" corra
// igual un `bcrypt.compare` (spec "no timing oracle" — sin esto, el camino
// de email desconocido sería medible más rápido que el de contraseña
// incorrecta, filtrando qué emails están registrados).
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeOgOTMY6X0J0j5aUp8bIYcNpZzYQZ8W2y';

async function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, COST);
}

// Verifica email+password contra `admin_users`. Devuelve `{id, email}` si
// coincide, `null` en cualquier otro caso — la ruta de login nunca debe
// poder distinguir "email inexistente" de "contraseña incorrecta" en el
// cuerpo ni en el tiempo de respuesta (spec admin-auth "Unknown email").
async function verifyCredentials(email, password, adminUsersModel = defaultAdminUsersModel) {
  const admin = await adminUsersModel.findByEmail(email);
  const hash = admin ? admin.password_hash : DUMMY_HASH;

  const matches = await bcrypt.compare(password, hash);
  if (!admin || !matches) return null;

  return { id: admin.id, email: admin.email };
}

// Regeneración de sesión en login (spec "Successful login") — mitiga session
// fixation: la sid anterior (anónima) nunca se reutiliza como sid
// autenticada.
function startSession(req, admin) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.adminId = admin.id;
      req.session.adminEmail = admin.email;
      resolve();
    });
  });
}

function endSession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

module.exports = { hashPassword, verifyCredentials, startSession, endSession, COST };
