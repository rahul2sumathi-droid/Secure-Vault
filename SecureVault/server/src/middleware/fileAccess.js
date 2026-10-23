const mongoose = require('mongoose');
const File = require('../models/File');
const audit = require('../services/audit');
const { resolveAccess } = require('../services/access');
const { HttpError, wrap } = require('../utils/http');

/**
 * Per-file authorization. `permission` is 'view' | 'download' | 'edit' | 'reshare' | 'owner'
 * or a function (req) => one of those. Sets req.doc (File) and req.access.
 * Users with no access at all get 404 so the existence of a file is not revealed.
 */
module.exports = (permission) =>
  wrap(async (req, _res, next) => {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(404, 'File not found');
    const doc = await File.findById(id).select('+encKeyRef');
    const needed = typeof permission === 'function' ? permission(req) : permission;
    const access = doc ? await resolveAccess(req.user, doc) : null;

    if (!doc || !access) {
      if (doc) await audit.record(req, 'access_denied', { file: doc, outcome: 'denied', details: { required: needed, reason: 'no access' } });
      throw new HttpError(404, 'File not found');
    }
    if (!access[needed]) {
      await audit.record(req, 'access_denied', { file: doc, outcome: 'denied', details: { required: needed } });
      throw new HttpError(403, needed === 'owner' ? 'Only the file owner can do this' : `You do not have "${needed}" permission on this file`);
    }
    req.doc = doc;
    req.access = access;
    next();
  });
