// Pantalla Configuración (Fase 6d, design.md D-C/D-D): edita los 4 datos de
// contacto que resuelve `store-config.js` (whatsapp_admin, instagram,
// email_contacto, cuit). Nunca toca los textos institucionales `page_*`
// (design.md "Requirement: Documented pre-existing debt") — esos siguen
// siendo edición manual, esta pantalla solo lo documenta.
const express = require('express');
const siteSettingsModel = require('../../models/site-settings');
const { validateSettings } = require('../../services/store-config-validation');
const { verifyToken } = require('../../middleware/csrf');
const config = require('../../config/env');

const router = express.Router();

async function renderSettings(res, { values, errors = {}, warnings = {}, status = 200 }) {
  res.status(status).render('admin/layouts/admin', {
    view: '../settings/form',
    title: `Configuración — ${config.NOMBRE_TIENDA}`,
    values,
    errors,
    warnings,
  });
}

router.get('/admin/configuracion', async (req, res, next) => {
  try {
    const settings = await siteSettingsModel.getAll();
    const values = {
      whatsapp_admin: settings.whatsapp_admin || '',
      instagram: settings.instagram || '',
      email_contacto: settings.email_contacto || '',
      cuit: settings.cuit || '',
    };
    await renderSettings(res, { values, errors: {}, warnings: {} });
  } catch (err) {
    next(err);
  }
});

router.post('/admin/configuracion', async (req, res, next) => {
  try {
    if (!verifyToken(req)) {
      return res.status(403).json({ error: 'csrf_invalid' });
    }

    const { values, errors, warnings } = validateSettings({
      whatsapp_admin: req.body.whatsapp_admin,
      instagram: req.body.instagram,
      email_contacto: req.body.email_contacto,
      cuit: req.body.cuit,
    });

    if (Object.keys(errors).length > 0) {
      return await renderSettings(res, { values, errors, warnings, status: 400 });
    }

    await siteSettingsModel.setMany(values);

    req.session.adminNotice =
      Object.keys(warnings).length > 0
        ? { type: 'error', message: 'Configuración guardada, con avisos — revisá el CUIT.' }
        : { type: 'success', message: 'Configuración guardada.' };

    return res.redirect(303, '/admin/configuracion');
  } catch (err) {
    next(err);
  }
});

module.exports = router;
