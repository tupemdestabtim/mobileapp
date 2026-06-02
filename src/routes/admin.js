const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const analyticsController = require('../controllers/analyticsController');
const reportController = require('../controllers/reportController');
const upload = require('../config/multer');
const { isAdmin } = require('../middleware/auth');
const { csrfMiddleware } = require('../middleware/csrf');
const rateLimit = require('express-rate-limit');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: 'Terlalu banyak percobaan login, coba lagi dalam 15 menit.'
});

// Terapkan perlindungan CSRF dan injeksi token ke res.locals
router.use(csrfMiddleware);

router.get('/login', adminController.loginPage);
router.post('/login', loginLimiter, adminController.loginProcess);
router.get('/logout', adminController.logout);

// Protected routes
router.use(isAdmin);

router.get('/dashboard', adminController.dashboard);
router.get('/monitoring', adminController.securityMonitoring);
router.get('/monitoring/export', adminController.exportSecurityLogs);
router.post('/monitoring/terminate/:id', adminController.terminateThreat);
router.post('/monitoring/recover/:id', adminController.recoverThreat);
router.post('/monitoring/clear/security', adminController.clearSecurityLogs);
router.post('/monitoring/clear/login', adminController.clearLoginLogs);
router.post('/monitoring/clear/activity', adminController.clearActivityLogs);

// System Management
router.get('/test-route', (req, res) => res.send('Routing system is working!'));

// Analytics API for Dashboard
router.get('/api/widgets', analyticsController.getWidgets);
router.post('/api/widgets', analyticsController.createWidget);
router.post('/api/widgets/delete/:id', analyticsController.deleteWidget);
router.get('/api/aggregate/:field_name', analyticsController.getAggregationData);

router.get('/system', adminController.systemPage);
router.post('/system/sync-schema', adminController.syncSchema);

router.get('/settings', adminController.appSettingsPage);
router.post('/settings', upload.single('app_logo'), adminController.updateAppSettings);

router.post('/settings/version', upload.single('apk_file'), adminController.uploadNewVersion);
router.post('/settings/version/delete/:id', adminController.deleteVersion);

router.get('/audit', adminController.listAuditLogs);
router.get('/audit/view/:id', adminController.viewAuditLog);

router.get('/keluarga', adminController.listKeluarga);
router.get('/keluarga/view/:no_kk', adminController.viewKeluarga);

router.get('/app-logs', adminController.appLogsPage);
router.post('/app-logs/clear', adminController.clearAppLogs);

router.get('/dusun', adminController.listDusun);
router.post('/dusun', adminController.createDusun);
router.post('/dusun/delete/:id', adminController.deleteDusun);

router.get('/users', adminController.listUsers);
router.post('/users', adminController.createUser);
router.post('/users/edit/:id', adminController.updateUser);
router.post('/users/delete/:id', adminController.deleteUser);

router.get('/warga', adminController.listWarga);
router.get('/warga/add', adminController.addWarga);
router.post('/warga/add', adminController.createWarga);
router.post('/warga/bulk-delete', adminController.bulkDeleteWarga);
router.get('/warga/edit/:id', adminController.editWarga);
router.post('/warga/edit/:id', adminController.updateWarga);
router.get('/warga/view/:id', adminController.viewWarga);
router.post('/warga/delete/:id', adminController.deleteWarga);

// Reporting Routes
router.get('/reports', reportController.index);
router.get('/reports/demografi', reportController.demografi);
router.get('/reports/sanitasi', reportController.sanitasi);
router.get('/reports/kesehatan', reportController.kesehatan);
router.get('/reports/kesejahteraan', reportController.kesejahteraan);
router.get('/reports/export-csv', reportController.exportCSV);

module.exports = router;
