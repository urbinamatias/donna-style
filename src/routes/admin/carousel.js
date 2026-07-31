// Gestión de slides del carrusel (Fase 6d, design.md D-A/D-B/D-E). Router
// separado, mismo criterio "un router por recurso" que product-images.js.
// Un slide SIEMPRE sube UN solo archivo: el sistema deriva desktop
// (1920x760) y mobile (1080x1350, recorte centrado del MISMO buffer) —
// nunca dos uploads separados, nunca recorte CSS-only.
const express = require('express');
const carouselSlidesModel = require('../../models/carousel-slides');
const images = require('../../services/images');
const { upload, makeMulterErrorHandler } = require('../../middleware/upload');
const { verifyToken } = require('../../middleware/csrf');
const { normalizeLinkUrl } = require('../../services/store-config-validation');
const config = require('../../config/env');

const router = express.Router();

// D-E (bug real de diseño): NUNCA reusa `mapMulterError` (product-bound) —
// esta instancia renderiza la vista de carrusel, no la de productos.
const carouselMulterErrorHandler = makeMulterErrorHandler({
  view: '../carousel/form',
  title: `Nuevo slide — ${config.NOMBRE_TIENDA}`,
});

function csrfGuardOrRespond(req, res) {
  if (verifyToken(req)) return true;
  res.status(403).json({ error: 'csrf_invalid' });
  return false;
}

// Spec "Slide listing with resulting home behaviour": banda de estado
// resultante del home según la cantidad de slides EFECTIVAMENTE visibles
// (activos y dentro de ventana), calculada con el mismo criterio que
// `findActive()` — pero acá se calcula en memoria sobre `findAllForAdmin()`
// para no duplicar la query ni tener que pegarle dos veces a la DB.
function isEffectivelyVisible(slide, now = new Date()) {
  if (!slide.is_active) return false;
  if (slide.starts_at && new Date(slide.starts_at) > now) return false;
  if (slide.ends_at && new Date(slide.ends_at) < now) return false;
  return true;
}

function resultingBehaviour(visibleCount) {
  if (visibleCount === 0) {
    return 'El carrusel está oculto en el home: no hay ningún slide activo y vigente ahora mismo.';
  }
  if (visibleCount === 1) {
    return 'El carrusel se muestra fijo en el home (un único slide activo, sin rotación).';
  }
  return `El carrusel rota en el home entre los ${visibleCount} slides activos y vigentes ahora mismo.`;
}

function parseDate(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) return null;
  return new Date(trimmed);
}

router.get('/admin/carrusel', async (req, res, next) => {
  try {
    const slides = await carouselSlidesModel.findAllForAdmin();
    const visibleCount = slides.filter((s) => isEffectivelyVisible(s)).length;

    res.render('admin/layouts/admin', {
      view: '../carousel/list',
      title: `Carrusel — ${config.NOMBRE_TIENDA}`,
      slides,
      isEffectivelyVisible,
      behaviourMessage: resultingBehaviour(visibleCount),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/admin/carrusel/nuevo', (req, res) => {
  res.render('admin/layouts/admin', {
    view: '../carousel/form',
    title: `Nuevo slide — ${config.NOMBRE_TIENDA}`,
    slide: null,
    error: null,
  });
});

router.get('/admin/carrusel/:id/editar', async (req, res, next) => {
  try {
    const slide = await carouselSlidesModel.findById(req.params.id);
    if (!slide) return res.status(404).send('Slide no encontrado.');
    res.render('admin/layouts/admin', {
      view: '../carousel/form',
      title: `Editar slide — ${config.NOMBRE_TIENDA}`,
      slide,
      error: null,
    });
  } catch (err) {
    next(err);
  }
});

// Alta (spec "Slide creation from a single upload"): UN solo `image`, un
// solo derivado (perfil `carousel`, sin recorte — QA fase 6d ronda 2, los
// slides son banners de diseño ya armados, nunca fotos a recortar).
router.post(
  '/admin/carrusel',
  upload.single('image'),
  carouselMulterErrorHandler,
  async (req, res, next) => {
    let baseKey;
    try {
      if (!csrfGuardOrRespond(req, res)) return;

      const file = req.file;
      if (!file) {
        return res.status(400).render('admin/layouts/admin', {
          view: '../carousel/form',
          title: `Nuevo slide — ${config.NOMBRE_TIENDA}`,
          slide: null,
          error: 'Subí una foto para crear el slide.',
        });
      }

      const altText = typeof req.body.alt_text === 'string' ? req.body.alt_text.trim() : '';
      if (!altText) {
        return res.status(400).render('admin/layouts/admin', {
          view: '../carousel/form',
          title: `Nuevo slide — ${config.NOMBRE_TIENDA}`,
          slide: null,
          error: 'El texto alternativo es obligatorio.',
        });
      }

      const linkResult = normalizeLinkUrl(req.body.link_url);
      if (linkResult.error) {
        return res.status(400).render('admin/layouts/admin', {
          view: '../carousel/form',
          title: `Nuevo slide — ${config.NOMBRE_TIENDA}`,
          slide: null,
          error: linkResult.error,
        });
      }

      const startsAt = parseDate(req.body.starts_at);
      const endsAt = parseDate(req.body.ends_at);
      if (startsAt && endsAt && endsAt < startsAt) {
        return res.status(400).render('admin/layouts/admin', {
          view: '../carousel/form',
          title: `Nuevo slide — ${config.NOMBRE_TIENDA}`,
          slide: null,
          error: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
        });
      }

      await images.assertUsable(file.buffer, 'carousel');

      baseKey = images.generateBaseKey();
      await images.processImage(file.buffer, { baseKey, profile: 'carousel' });

      const existing = await carouselSlidesModel.findAllForAdmin();

      try {
        await carouselSlidesModel.create({
          baseKey,
          altText,
          linkUrl: linkResult.value || null,
          sortOrder: existing.length,
          isActive: req.body.is_active === 'on',
          startsAt,
          endsAt,
        });
      } catch (err) {
        // Spec "Processing failure leaves no partial state": si el INSERT
        // falla, los derivados ya escritos se borran.
        await images.removeImageFiles(null, baseKey, { profile: 'carousel' });
        throw err;
      }

      req.session.adminNotice = { type: 'success', message: 'Slide creado.' };
      return res.redirect(303, '/admin/carrusel');
    } catch (err) {
      if (err.code === 'BAD_IMAGE' || err.code === 'TOO_SMALL') {
        return res.status(400).render('admin/layouts/admin', {
          view: '../carousel/form',
          title: `Nuevo slide — ${config.NOMBRE_TIENDA}`,
          slide: null,
          error: err.message,
        });
      }
      return next(err);
    }
  }
);

// Edición de metadata (spec "Slide edition, scheduling and ordering"):
// NUNCA re-sube imagen — `base_key` es inmutable acá.
router.post('/admin/carrusel/:id', async (req, res, next) => {
  try {
    if (!csrfGuardOrRespond(req, res)) return;

    const altText = typeof req.body.alt_text === 'string' ? req.body.alt_text.trim() : '';
    if (!altText) {
      const slide = await carouselSlidesModel.findById(req.params.id);
      return res.status(400).render('admin/layouts/admin', {
        view: '../carousel/form',
        title: `Editar slide — ${config.NOMBRE_TIENDA}`,
        slide: { ...slide, ...req.body },
        error: 'El texto alternativo es obligatorio.',
      });
    }

    const linkResult = normalizeLinkUrl(req.body.link_url);
    if (linkResult.error) {
      const slide = await carouselSlidesModel.findById(req.params.id);
      return res.status(400).render('admin/layouts/admin', {
        view: '../carousel/form',
        title: `Editar slide — ${config.NOMBRE_TIENDA}`,
        slide: { ...slide, ...req.body },
        error: linkResult.error,
      });
    }

    const startsAt = parseDate(req.body.starts_at);
    const endsAt = parseDate(req.body.ends_at);
    if (startsAt && endsAt && endsAt < startsAt) {
      const slide = await carouselSlidesModel.findById(req.params.id);
      return res.status(400).render('admin/layouts/admin', {
        view: '../carousel/form',
        title: `Editar slide — ${config.NOMBRE_TIENDA}`,
        slide: { ...slide, ...req.body },
        error: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
      });
    }

    await carouselSlidesModel.update(req.params.id, {
      altText,
      linkUrl: linkResult.value || null,
      isActive: req.body.is_active === 'on',
      startsAt,
      endsAt,
    });

    req.session.adminNotice = { type: 'success', message: 'Slide actualizado.' };
    return res.redirect(303, '/admin/carrusel');
  } catch (err) {
    next(err);
  }
});

// Reorder ↑/↓ (spec "Reorder", mismo patrón que product-images.js).
router.post('/admin/carrusel/:id/mover', async (req, res, next) => {
  try {
    if (!csrfGuardOrRespond(req, res)) return;

    const direction = req.body.direction === 'down' ? 'down' : 'up';
    const slides = await carouselSlidesModel.findAllForAdmin();
    const ids = slides
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((s) => String(s.id));

    const reordered = carouselSlidesModel.reorderIds(ids, String(req.params.id), direction);
    await carouselSlidesModel.reorder(reordered);

    return res.redirect(303, '/admin/carrusel');
  } catch (err) {
    next(err);
  }
});

// Borrado real (spec "Real deletion of a slide", mismo criterio que borrar
// foto de producto en Fase 6b): fila + los 3 archivos derivados, tolerante
// a archivos ya ausentes.
router.post('/admin/carrusel/:id/eliminar', async (req, res, next) => {
  try {
    if (!csrfGuardOrRespond(req, res)) return;

    const removed = await carouselSlidesModel.remove(req.params.id);
    if (!removed) return res.status(404).send('Slide no encontrado.');

    await images.removeImageFiles(null, removed.base_key, { profile: 'carousel' });

    req.session.adminNotice = { type: 'success', message: 'Slide eliminado.' };
    return res.redirect(303, '/admin/carrusel');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
