// Normalizadores puros de la pantalla Configuración + `normalizeLinkUrl`
// (usado por el form de slides del carrusel). Sin DB — mismo patrón que
// `orders-status.js`/`cart.js` (design.md D-D). Cada `normalize*` devuelve
// `{ value, error?, warning? }`: `error` bloquea el guardado, `warning` no
// (decisión de negocio cerrada: el mod-11 de CUIT NUNCA bloquea).

function normalizeWhatsapp(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.length === 0) {
    return { value: '', error: 'El WhatsApp es obligatorio.' };
  }
  if (digits.length < 10 || digits.length > 15) {
    return {
      value: digits,
      error: `El WhatsApp debe tener entre 10 y 15 dígitos (tiene ${digits.length}).`,
    };
  }
  return { value: digits };
}

function normalizeInstagram(raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed.length === 0) return { value: '' };

  let handle = trimmed;
  const urlMatch = /instagram\.com\/([^/?#]+)/i.exec(trimmed);
  if (urlMatch) {
    handle = urlMatch[1];
  }
  handle = handle.replace(/^@/, '');
  if (handle.length === 0) {
    return { value: '', error: 'Instagram no es un @handle ni una URL válida.' };
  }
  return { value: `@${handle}` };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed.length === 0) return { value: '' };
  if (trimmed.length > 254) {
    return { value: trimmed, error: 'El email es demasiado largo (máximo 254 caracteres).' };
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    return { value: trimmed, error: 'El email no tiene un formato válido.' };
  }
  return { value: trimmed };
}

// Mod-11 estándar argentino, pesos [5,4,3,2,7,6,5,4,3,2] sobre los primeros
// 10 dígitos. Resto 11 → dígito 0; resto 10 → dígito 9 (caso especial
// documentado del algoritmo).
const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function cuitCheckDigit(tenDigits) {
  const digits = String(tenDigits).split('').map(Number);
  const sum = digits.reduce((acc, d, i) => acc + d * CUIT_WEIGHTS[i], 0);
  const mod = sum % 11;
  const remainder = 11 - mod;
  if (remainder === 11) return 0;
  if (remainder === 10) return 9;
  return remainder;
}

function normalizeCuit(raw) {
  const digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.length === 0) {
    return { value: '', error: 'El CUIT es obligatorio.' };
  }
  if (digits.length !== 11) {
    return {
      value: digits,
      error: `El CUIT debe tener 11 dígitos, con o sin guiones (tiene ${digits.length}).`,
    };
  }

  const formatted = `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
  const expected = cuitCheckDigit(digits.slice(0, 10));
  const actual = Number(digits[10]);

  if (expected !== actual) {
    return {
      value: formatted,
      warning: 'El dígito verificador del CUIT no cierra (mod-11) — se guardó igual, revisalo cuando puedas.',
    };
  }
  return { value: formatted };
}

// Cierra un hueco real de seguridad: EJS escapa entidades HTML, pero eso
// NUNCA neutraliza un `href="javascript:..."` — el navegador ejecuta ese
// esquema igual aunque el string esté perfectamente escapado como texto.
// Whitelist estricta: solo vacío (sin link), path relativo, o http(s)://.
function normalizeLinkUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (trimmed.length === 0) return { value: '' };
  if (trimmed.startsWith('/')) return { value: trimmed };
  if (/^https?:\/\//i.test(trimmed)) return { value: trimmed };
  return { value: trimmed, error: 'El link debe ser una ruta relativa (/algo) o una URL http(s)://.' };
}

// Orquesta los 4 campos de Configuración en un solo llamado — el router los
// consume tal cual (`values`/`errors`/`warnings`), design.md D-D.
function validateSettings(input) {
  const fields = {
    whatsapp_admin: normalizeWhatsapp(input.whatsapp_admin),
    instagram: normalizeInstagram(input.instagram),
    email_contacto: normalizeEmail(input.email_contacto),
    cuit: normalizeCuit(input.cuit),
  };

  const values = {};
  const errors = {};
  const warnings = {};

  for (const [field, result] of Object.entries(fields)) {
    values[field] = result.value;
    if (result.error) errors[field] = result.error;
    if (result.warning) warnings[field] = result.warning;
  }

  return { values, errors, warnings };
}

module.exports = {
  validateSettings,
  normalizeWhatsapp,
  normalizeInstagram,
  normalizeEmail,
  normalizeCuit,
  cuitCheckDigit,
  normalizeLinkUrl,
};
