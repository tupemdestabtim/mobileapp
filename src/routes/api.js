const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const { apiAuth } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');
const antiReplay = require('../middleware/antiReplay');

const analyticsController = require('../controllers/analyticsController');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 login requests per windowMs
  message: { message: 'Terlalu banyak percobaan login, coba lagi dalam 15 menit.' }
});

const uploadLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20, // Max 20 write operations per minute per IP
  message: { message: 'Terlalu banyak pengiriman data, mohon tunggu sebentar.' }
});

router.post('/login', loginLimiter, apiController.login);
router.post('/refresh-token', apiController.refreshToken);
router.get('/config', apiController.getAppConfig);

// Unprotected logging for critical security events during login screen
router.post('/security-log', apiController.addSecurityLog);

// Protected routes
router.use(apiAuth);
router.use(antiReplay); // Apply anti-replay to all authenticated writes

router.get('/schema', apiController.getSchema);
router.get('/warga', apiController.listWarga);
router.get('/warga/:id', apiController.getWargaById);
router.post('/warga', uploadLimiter, apiController.createWarga);
router.put('/warga/:id', uploadLimiter, apiController.updateWarga);
router.delete('/warga/:id', uploadLimiter, apiController.deleteWarga);

router.post('/activity-log', apiController.addActivityLog);

// Dashboard Analytics for Mobile
router.get('/summary', analyticsController.getSummary);
router.get('/widgets', analyticsController.getWidgets);
router.get('/aggregate/:field_name', analyticsController.getAggregationData);

module.exports = router;
