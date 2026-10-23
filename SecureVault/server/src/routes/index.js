const router = require('express').Router();
const { body } = require('express-validator');
const validate = require('../middleware/validate');
const limits = require('../middleware/rateLimit');
const { authenticate, requireRole } = require('../middleware/auth');
const fileAccess = require('../middleware/fileAccess');
const { passwordPolicy, PASSWORD_MESSAGE } = require('../utils/password');

const auth = require('../controllers/authController');
const files = require('../controllers/fileController');
const perms = require('../controllers/permissionController');
const audit = require('../controllers/auditController');
const admin = require('../controllers/adminController');
const misc = require('../controllers/miscController');

const email = () => body('email').isString().bail().customSanitizer((v) => v.trim().toLowerCase()).isEmail().withMessage('Enter a valid email address').isLength({ max: 254 });
const newPassword = (field = 'password') => body(field).custom(passwordPolicy).withMessage(PASSWORD_MESSAGE);
const code = () => body('code').isString().trim().isLength({ min: 6, max: 20 }).withMessage('Enter the code');

// ---------- Auth ----------
router.post('/auth/register', limits.auth,
  body('name').isString().trim().isLength({ min: 2, max: 80 }).withMessage('Name must be 2-80 characters'),
  email(), newPassword(), validate, auth.register);
router.post('/auth/login', limits.auth, email(), body('password').isString().isLength({ min: 1, max: 128 }), validate, auth.login);
router.post('/auth/mfa/verify', limits.auth, body('mfaToken').isString(), code(), validate, auth.verifyMfa);
router.post('/auth/refresh', limits.refresh, auth.refresh);
router.post('/auth/logout', auth.logout);
router.post('/auth/forgot', limits.sensitive, email(), validate, auth.forgotPassword);
router.post('/auth/reset', limits.auth, body('token').isString().isLength({ min: 20, max: 200 }), newPassword(), validate, auth.resetPassword);

router.get('/auth/me', authenticate, auth.me);
router.post('/auth/logout-all', authenticate, auth.logoutAll);
router.get('/auth/sessions', authenticate, auth.listSessions);
router.delete('/auth/sessions/:id', authenticate, auth.revokeSession);
router.post('/auth/mfa/setup', authenticate, limits.auth, auth.mfaSetup);
router.post('/auth/mfa/enable', authenticate, limits.auth, code(), validate, auth.mfaEnable);
router.post('/auth/mfa/disable', authenticate, limits.auth, body('password').isString(), code(), validate, auth.mfaDisable);
router.post('/auth/change-password', authenticate, limits.auth, body('currentPassword').isString(), newPassword('newPassword'), validate, auth.changePassword);

// ---------- Everything below requires a signed-in user ----------
router.use(authenticate);

router.get('/dashboard', misc.dashboard);
router.get('/users/search', requireRole('owner', 'collaborator'), misc.searchUsers);

// ---------- Files ----------
router.get('/files', requireRole('owner', 'collaborator'), files.list);
router.post('/files', requireRole('owner'), files.upload, files.create);
router.get('/files/:id', fileAccess('view'), files.get);
router.get('/files/:id/download', fileAccess((req) => (req.query.inline === '1' ? 'view' : 'download')), files.download);
router.get('/files/:id/versions', fileAccess('view'), files.listVersions);
router.post('/files/:id/versions', fileAccess('edit'), files.upload, files.uploadVersion);
router.post('/files/:id/versions/:no/restore', fileAccess('owner'), files.restoreVersion);
router.get('/files/:id/activity', fileAccess('owner'), files.activity);
router.delete('/files/:id', fileAccess('owner'), files.remove);

// ---------- Sharing (ACL) ----------
router.get('/files/:id/permissions', fileAccess('reshare'), perms.list);
router.post('/files/:id/share', fileAccess('reshare'), email(), body('expiresAt').optional({ nullable: true, checkFalsy: true }).isISO8601().withMessage('Invalid expiry date'),
  body(['download', 'edit', 'reshare']).optional().isBoolean().withMessage('Permissions must be true/false'), validate, perms.share);
router.delete('/files/:id/permissions/:permId', fileAccess('reshare'), perms.revoke);

// ---------- Audit (read-only) ----------
router.get('/audit', requireRole('auditor', 'admin'), audit.list);
router.get('/audit/actions', requireRole('auditor', 'admin'), audit.actions);
router.get('/audit/export', requireRole('auditor', 'admin'), audit.exportCsv);
router.get('/audit/verify', requireRole('auditor', 'admin'), audit.verify);

// ---------- Admin ----------
router.get('/admin/users', requireRole('admin'), admin.listUsers);
router.patch('/admin/users/:id', requireRole('admin'),
  body('role').optional().isIn(['admin', 'owner', 'collaborator', 'auditor']), body('isActive').optional().isBoolean({ strict: true }), validate, admin.updateUser);
router.get('/admin/grants', requireRole('admin'), admin.listGrants);
router.delete('/admin/grants/:permId', requireRole('admin'), admin.revokeGrant);

module.exports = router;
