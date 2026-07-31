// RED (tasks.md 1.6, design.md D-D): normalizadores puros de Configuración
// + `normalizeLinkUrl` (usado por el form de slides del carrusel). Sin DB —
// mismo patrón que `orders-status.test.js`.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateSettings,
  normalizeWhatsapp,
  normalizeInstagram,
  normalizeEmail,
  normalizeCuit,
  cuitCheckDigit,
  normalizeLinkUrl,
} = require('../../src/services/store-config-validation');

test('normalizeWhatsapp: acepta 10-15 dígitos y quita +/espacios/guiones', () => {
  const result = normalizeWhatsapp('+54 9 351-750-5083');
  assert.equal(result.value, '5493517505083');
  assert.equal(result.error, undefined);
});

test('normalizeWhatsapp: menos de 10 dígitos es error, requerido', () => {
  const result = normalizeWhatsapp('12345');
  assert.ok(result.error);
});

test('normalizeWhatsapp: vacío es error (campo requerido)', () => {
  const result = normalizeWhatsapp('');
  assert.ok(result.error);
});

test('normalizeWhatsapp: más de 15 dígitos es error', () => {
  const result = normalizeWhatsapp('1234567890123456');
  assert.ok(result.error);
});

test('normalizeInstagram: URL se normaliza a @handle', () => {
  const result = normalizeInstagram('https://instagram.com/donna_styleok');
  assert.equal(result.value, '@donna_styleok');
});

test('normalizeInstagram: handle sin @ se normaliza agregándolo', () => {
  const result = normalizeInstagram('donna_styleok');
  assert.equal(result.value, '@donna_styleok');
});

test('normalizeInstagram: vacío es válido (campo opcional), valor queda string vacío', () => {
  const result = normalizeInstagram('');
  assert.equal(result.value, '');
  assert.equal(result.error, undefined);
});

test('normalizeEmail: formato básico válido, trim aplicado', () => {
  const result = normalizeEmail('  yesi2682@hotmail.com  ');
  assert.equal(result.value, 'yesi2682@hotmail.com');
  assert.equal(result.error, undefined);
});

test('normalizeEmail: vacío es válido (campo opcional)', () => {
  const result = normalizeEmail('');
  assert.equal(result.value, '');
  assert.equal(result.error, undefined);
});

test('normalizeEmail: sin @ es error de formato', () => {
  const result = normalizeEmail('no-es-un-email');
  assert.ok(result.error);
});

test('normalizeEmail: más de 254 caracteres es error', () => {
  const long = `${'a'.repeat(250)}@a.com`;
  const result = normalizeEmail(long);
  assert.ok(result.error);
});

test('cuitCheckDigit: calcula el dígito verificador mod-11 correctamente para un CUIT real', () => {
  // 27-29456245-7 (CUIT real del cliente, §0) — dígito verificador real: 7.
  assert.equal(cuitCheckDigit('2729456245'), 7);
});

test('normalizeCuit: acepta formato NN-NNNNNNNN-N y lo mantiene formateado', () => {
  const result = normalizeCuit('27-29456245-7');
  assert.equal(result.value, '27-29456245-7');
  assert.equal(result.error, undefined);
  assert.equal(result.warning, undefined);
});

test('normalizeCuit: acepta 11 dígitos sin guiones y los formatea', () => {
  const result = normalizeCuit('27294562457');
  assert.equal(result.value, '27-29456245-7');
});

test('normalizeCuit: dígito verificador que NO cierra el mod-11 se GUARDA igual, con warning (nunca bloquea, decisión de negocio cerrada)', () => {
  const result = normalizeCuit('27-29456245-9');
  assert.equal(result.value, '27-29456245-9');
  assert.equal(result.error, undefined);
  assert.ok(result.warning, 'debe traer un warning no bloqueante');
});

test('normalizeCuit: cantidad de dígitos distinta de 11 es error de FORMATO (bloquea, distinto del check digit)', () => {
  const result = normalizeCuit('27-2945-7');
  assert.ok(result.error);
});

test('normalizeCuit: vacío es error (campo requerido)', () => {
  const result = normalizeCuit('');
  assert.ok(result.error);
});

test('normalizeLinkUrl: string vacío es válido (slide sin link)', () => {
  const result = normalizeLinkUrl('');
  assert.equal(result.value, '');
  assert.equal(result.error, undefined);
});

test('normalizeLinkUrl: acepta un path relativo', () => {
  const result = normalizeLinkUrl('/noche');
  assert.equal(result.value, '/noche');
});

test('normalizeLinkUrl: acepta http(s)://', () => {
  assert.equal(normalizeLinkUrl('https://donnastyle.com/promo').value, 'https://donnastyle.com/promo');
  assert.equal(normalizeLinkUrl('http://donnastyle.com/promo').value, 'http://donnastyle.com/promo');
});

test('normalizeLinkUrl: RECHAZA javascript: URI (RED de seguridad, EJS no neutraliza esto en un atributo href)', () => {
  const result = normalizeLinkUrl('javascript:alert(1)');
  assert.ok(result.error);
});

test('normalizeLinkUrl: rechaza cualquier otro esquema no contemplado (ej. data:)', () => {
  const result = normalizeLinkUrl('data:text/html,<script>alert(1)</script>');
  assert.ok(result.error);
});

test('validateSettings: caso feliz, todos los campos válidos', () => {
  const { values, errors, warnings } = validateSettings({
    whatsapp_admin: '5493517505083',
    instagram: '@donna_styleok',
    email_contacto: 'yesi2682@hotmail.com',
    cuit: '27-29456245-7',
  });
  assert.deepEqual(errors, {});
  assert.deepEqual(warnings, {});
  assert.equal(values.whatsapp_admin, '5493517505083');
  assert.equal(values.cuit, '27-29456245-7');
});

test('validateSettings: whatsapp_admin vacío rechaza con error de campo, no bloquea instagram/email válidos', () => {
  const { errors } = validateSettings({
    whatsapp_admin: '',
    instagram: '',
    email_contacto: '',
    cuit: '27-29456245-7',
  });
  assert.ok(errors.whatsapp_admin);
});

test('validateSettings: CUIT con check digit inválido no aparece en errors, solo en warnings', () => {
  const { errors, warnings } = validateSettings({
    whatsapp_admin: '5493517505083',
    instagram: '',
    email_contacto: '',
    cuit: '27-29456245-9',
  });
  assert.equal(errors.cuit, undefined);
  assert.ok(warnings.cuit);
});
