// Rate limit de intentos de login por IP (Fase 6a, design.md D5). Map en
// memoria de proceso — un único admin, un único proceso — con barrido
// perezoso de entradas vencidas en cada invocación y un tope duro de claves
// para que un atacante rotando de IP no pueda crecer el mapa sin límite.
// Deliberadamente NUNCA global ni por cuenta (spec "Global account lockout
// is explicitly rejected" — un tercero no puede bloquear a la única dueña).
const MAX_KEYS = 10000;

function loginRateLimit({ max = 5, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const attempts = new Map();

  function sweep(currentTime) {
    for (const [ip, entry] of attempts) {
      if (entry.resetAt <= currentTime) attempts.delete(ip);
    }
  }

  function evictOldestIfOverCap() {
    if (attempts.size <= MAX_KEYS) return;
    const oldestKey = attempts.keys().next().value;
    if (oldestKey !== undefined) attempts.delete(oldestKey);
  }

  function middleware(req, res, next) {
    const currentTime = now();
    sweep(currentTime);

    const ip = req.ip;
    let entry = attempts.get(ip);
    if (!entry || entry.resetAt <= currentTime) {
      entry = { count: 0, resetAt: currentTime + windowMs };
      attempts.set(ip, entry);
      evictOldestIfOverCap();
    }

    if (entry.count >= max) {
      return res.status(429).json({ error: 'rate_limited' });
    }

    // Expuesto para que la ruta de login registre el fallo/éxito real —
    // el middleware no sabe si la contraseña era correcta, solo cuenta.
    req.rateLimit = {
      recordFailure: () => {
        entry.count += 1;
      },
      reset: () => {
        attempts.delete(ip);
      },
    };

    return next();
  }

  // Expuesto solo para tests (evicción, tamaño del map) — nunca usado por
  // rutas de producción.
  middleware._attempts = attempts;

  return middleware;
}

// Rate limit de un endpoint de LECTURA (design.md D2, buscador): a
// diferencia de `loginRateLimit`, cuenta SIEMPRE (no hay noción de
// "fallo"/`recordFailure` — cada request cuenta). Factory separada, no un
// flag `autoCount` en `loginRateLimit`, para no meter una rama en el camino
// crítico de auth por cero beneficio (~25 líneas duplicadas de bookkeeping
// del Map es el riesgo más barato).
function fixedWindowRateLimit({ max = 30, windowMs = 60 * 1000, now = Date.now, onLimited } = {}) {
  const hits = new Map();

  function sweep(currentTime) {
    for (const [ip, entry] of hits) {
      if (entry.resetAt <= currentTime) hits.delete(ip);
    }
  }

  function evictOldestIfOverCap() {
    if (hits.size <= MAX_KEYS) return;
    const oldestKey = hits.keys().next().value;
    if (oldestKey !== undefined) hits.delete(oldestKey);
  }

  function defaultLimited(req, res) {
    res.status(429).type('text/plain').send('Demasiadas búsquedas. Probá de nuevo en un minuto.');
  }

  function middleware(req, res, next) {
    const currentTime = now();
    sweep(currentTime);

    const ip = req.ip;
    let entry = hits.get(ip);
    if (!entry || entry.resetAt <= currentTime) {
      entry = { count: 0, resetAt: currentTime + windowMs };
      hits.set(ip, entry);
      evictOldestIfOverCap();
    }

    entry.count += 1;
    if (entry.count > max) {
      return (onLimited || defaultLimited)(req, res);
    }

    return next();
  }

  // Expuesto solo para tests — mismo criterio que `loginRateLimit._attempts`.
  middleware._hits = hits;

  return middleware;
}

module.exports = { loginRateLimit, fixedWindowRateLimit };
