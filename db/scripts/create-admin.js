// Provisioning de la única admin (Fase 6a, §6.2/§1 de prompt.md: "El único
// login del sistema es el de la dueña"). Sin ruta pública de signup — este
// script es el único camino de alta, corrido una vez, a mano, desde
// Windows (CLAUDE.md §5).
//
// Uso:
//   node db/scripts/create-admin.js --email dueña@donnastyle.com --password "un-password-largo"
//   npm run create-admin -- --email dueña@donnastyle.com --password "un-password-largo"
//
// Rechaza el alta si YA existe un admin, salvo que se pase --force (evita
// crear una segunda cuenta por accidente en un sistema pensado para una
// sola).
require('dotenv').config();
const { pool } = require('../../src/db/pool');
const adminUsersModel = require('../../src/models/admin-users');
const { hashPassword } = require('../../src/services/auth');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--force') {
      args.force = true;
      continue;
    }
    if (token.startsWith('--')) {
      const key = token.slice(2);
      args[key] = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const email = args.email || process.env.ADMIN_EMAIL;
  const password = args.password || process.env.ADMIN_PASSWORD;

  if (!email || !password) {
    console.error('Uso: node db/scripts/create-admin.js --email <email> --password <password> [--force]');
    process.exitCode = 1;
    return;
  }

  if (password.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres.');
    process.exitCode = 1;
    return;
  }

  const { rows: existing } = await pool.query('SELECT count(*)::int AS n FROM admin_users');
  if (existing[0].n > 0 && !args.force) {
    console.error(
      `Ya existe ${existing[0].n} admin(s). Este proyecto tiene un único login (§1 de prompt.md). ` +
        'Si de verdad querés crear otro, volvé a correr con --force.'
    );
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  const admin = await adminUsersModel.create({ email, passwordHash });

  if (!admin) {
    console.error(`Ya existe un admin con el email ${email}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`Admin creada: ${admin.email} (id ${admin.id}).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
