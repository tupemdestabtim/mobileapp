const User = require('../models/User');
const Dusun = require('../models/Dusun');
const Warga = require('../models/Warga');
const AuditLog = require('../models/AuditLog');
const AppLog = require('../models/AppLog');
const AppConfig = require('../models/AppConfig');
const AppVersion = require('../models/AppVersion');
const LoginLog = require('../models/LoginLog');
const ActivityLog = require('../models/ActivityLog');
const SecurityLog = require('../models/SecurityLog');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const { syncTableWithSchema } = require('../config/schema-sync');
const { logActivity, writeAppLog } = require('../utils/logger');
const { Sequelize, Op } = require('sequelize');

function getSchema() {
  const schemaPath = path.join(__dirname, '../../form-schema.json');
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

module.exports = {
  loginPage: (req, res) => {
    if (req.session.user) return res.redirect('/admin/dashboard');
    res.render('admin/login', { layout: false });
  },

  loginProcess: async (req, res) => {
    const { username, password } = req.body;
    try {
      const user = await User.findOne({ where: { username, role: 'admin' } });
      if (user && await bcrypt.compare(password, user.password)) {
        // Security: Regenerate session on login
        req.session.regenerate((err) => {
          if (err) throw err;
          req.session.user = {
            id: user.id,
            username: user.username,
            role: user.role,
            nama_lengkap: user.nama_lengkap
          };
          res.redirect('/admin/dashboard');
        });
      } else {
        req.session.error_msg = 'Invalid username or password';
        res.redirect('/admin/login');
      }
    } catch (error) {
      console.error(error);
      await writeAppLog('error', 'Admin Login Error', error.stack, 'adminController.loginProcess');
      res.redirect('/admin/login');
    }
  },

  logout: (req, res) => {
    req.session.destroy((err) => {
      if (err) console.error('Logout error:', err);
      res.clearCookie('sessionId'); // Default name, but app.js uses __Host-sessionId in prod
      res.redirect('/admin/login');
    });
  },

  dashboard: async (req, res) => {
    console.log('[DEBUG] dashboard controller hit');
    try {
      const totalDusun = await Dusun.count();
      const totalPetugas = await User.count({ where: { role: 'petugas' } });
      const totalWarga = await Warga.count();
      
      // Count unique Family Cards (KK)
      const totalKK = await Warga.count({
        distinct: true,
        col: 'no_kk'
      });

      res.render('admin/dashboard', { 
        totalDusun, 
        totalPetugas, 
        totalWarga, 
        totalKK,
        schema: getSchema()
      });
    } catch (error) {
      await writeAppLog('error', 'Dashboard Load Error', error.stack, 'adminController.dashboard');
      res.status(500).send("Terjadi kesalahan sistem saat memuat dashboard.");
    }
  },

  securityMonitoring: async (req, res) => {
    try {
      // 1. Get recent logins (Online Users approximation based on last 24h for dashboard, 
      // but "online" usually means recent activity. Let's get latest 50 logins)
      const recentLogins = await LoginLog.findAll({
        include: [{ model: User, attributes: ['nama_lengkap', 'username'] }],
        order: [['login_at', 'DESC']],
        limit: 50
      });

      // 2. Get recent security threats (Root, Fake GPS, etc)
      const securityThreats = await SecurityLog.findAll({
        order: [['created_at', 'DESC']],
        limit: 50
      });

      // 3. Get recent activity / location
      const recentActivities = await ActivityLog.findAll({
        include: [{ model: User, attributes: ['nama_lengkap'] }],
        order: [['timestamp', 'DESC']],
        limit: 50
      });

      // 4. Statistics
      const totalWarga = await Warga.count();
      const threatsCount = await SecurityLog.count({
        where: {
          created_at: {
            [Op.gte]: new Date(new Date() - 24 * 60 * 60 * 1000) // Last 24 hours
          }
        }
      });
      const activeDevices = await LoginLog.count({
        distinct: true,
        col: 'device_id',
        where: {
          login_at: {
            [Op.gte]: new Date(new Date() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        }
      });

      res.render('admin/monitoring', {
        recentLogins,
        securityThreats,
        recentActivities,
        stats: {
          totalWarga,
          threatsCount24h: threatsCount,
          activeDevices7d: activeDevices
        }
      });
    } catch (error) {
      console.error(error);
      await writeAppLog('error', 'Security Monitoring Load Error', error.stack, 'adminController.securityMonitoring');
      req.session.error_msg = 'Gagal memuat halaman monitoring. Coba jalankan sinkronisasi database.';
      res.redirect('/admin/dashboard');
    }
  },

  exportSecurityLogs: async (req, res) => {
    try {
      const ExcelJS = require('exceljs');
      const securityLogs = await SecurityLog.findAll({
        order: [['created_at', 'DESC']],
        raw: true
      });

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Security Logs');

      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'Event', key: 'event', width: 30 },
        { header: 'Device', key: 'device', width: 40 },
        { header: 'Risk', key: 'risk', width: 15 },
        { header: 'Timestamp', key: 'created_at', width: 25 }
      ];

      worksheet.getRow(1).font = { bold: true };
      
      securityLogs.forEach(log => {
        worksheet.addRow({
          ...log,
          created_at: new Date(log.created_at).toLocaleString()
        });
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=security_logs.xlsx');
      
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error(error);
      res.status(500).send("Gagal mengekspor data.");
    }
  },

  terminateThreat: async (req, res) => {
    try {
      const { id } = req.params;
      const log = await SecurityLog.findByPk(id);
      if (log) {
        log.is_blocked = true;
        await log.save();
        return res.json({ success: true, message: `Ancaman ID ${id} berhasil diblokir.` });
      }
      return res.status(404).json({ success: false, message: 'Log tidak ditemukan.' });
    } catch (error) {
      console.error('Terminate Threat Error:', error);
      await writeAppLog('error', 'Terminate Threat Error', error.stack, 'adminController.terminateThreat');
      return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
  },

  recoverThreat: async (req, res) => {
    try {
      const { id } = req.params;
      const log = await SecurityLog.findByPk(id);
      if (log) {
        log.is_blocked = false;
        await log.save();
        return res.json({ success: true, message: `Blokir untuk ancaman ID ${id} berhasil dipulihkan.` });
      }
      return res.status(404).json({ success: false, message: 'Log tidak ditemukan.' });
    } catch (error) {
      console.error('Recover Threat Error:', error);
      await writeAppLog('error', 'Recover Threat Error', error.stack, 'adminController.recoverThreat');
      return res.status(500).json({ success: false, message: 'Terjadi kesalahan server.' });
    }
  },

  clearSecurityLogs: async (req, res) => {
    try {
      await SecurityLog.destroy({ where: {} });
      res.json({ success: true, message: 'Log Keamanan berhasil dibersihkan.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Gagal membersihkan Log Keamanan.' });
    }
  },

  clearLoginLogs: async (req, res) => {
    try {
      await LoginLog.destroy({ where: {} });
      res.json({ success: true, message: 'Riwayat Login berhasil dibersihkan.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Gagal membersihkan Riwayat Login.' });
    }
  },

  clearActivityLogs: async (req, res) => {
    try {
      await ActivityLog.destroy({ where: {} });
      res.json({ success: true, message: 'Log Aktivitas berhasil dibersihkan.' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ success: false, message: 'Gagal membersihkan Log Aktivitas.' });
    }
  },

  // System Sync
  systemPage: (req, res) => {
    console.log('[DEBUG] systemPage controller hit');
    const schema = getSchema();
    res.render('admin/system', { schema });
  },

  syncSchema: async (req, res) => {
    console.log('[DEBUG] syncSchema controller hit');
    try {
      const { password } = req.body;
      if (!password) {
        throw new Error('Password konfirmasi tidak diberikan.');
      }
      
      const admin = await User.findByPk(req.session.user.id);
      const isMatch = await bcrypt.compare(password, admin.password);
      if (!isMatch) {
        throw new Error('Otorisasi gagal: Password salah.');
      }

      await syncTableWithSchema();
      await logActivity(req.session.user.id, 'SYNC_SCHEMA', 0, 'Database Schema', null, { status: 'Success' });
      req.session.success_msg = 'Database schema synced successfully with form-schema.json';
    } catch (error) {
      console.error(error);
      await writeAppLog('error', 'Schema Sync Error', error.stack, 'adminController.syncSchema');
      req.session.error_msg = 'Sync failed: ' + error.message;
    }
    res.redirect('/admin/system');
  },

  appSettingsPage: async (req, res) => {
    console.log('[DEBUG] appSettingsPage controller hit');
    try {
      const config = await AppConfig.findOne();
      const versions = await AppVersion.findAll({ order: [['created_at', 'DESC']] });
      res.render('admin/settings', { config, versions });
    } catch (error) {
      console.error(error);
      await writeAppLog('error', 'Settings Page Load Error', error.stack, 'adminController.appSettingsPage');
      res.redirect('/admin/dashboard');
    }
  },

  updateAppSettings: async (req, res) => {
    console.log('[DEBUG] updateAppSettings controller hit');
    try {
      const { app_title, village_name, welcome_message, mobile_app_version } = req.body;
      const config = await AppConfig.findOne();
      
      const updateData = {
        app_title,
        village_name,
        welcome_message,
        mobile_app_version
      };

      if (req.file) {
        updateData.app_logo_url = `/uploads/${req.file.filename}`;
      }
      
      await config.update(updateData);

      req.session.success_msg = 'Pengaturan aplikasi berhasil diperbarui.';
    } catch (error) {
      console.error(error);
      await writeAppLog('error', 'Update App Settings Error', error.stack, 'adminController.updateAppSettings');
      req.session.error_msg = 'Gagal memperbarui pengaturan.';
    }
    res.redirect('/admin/settings');
  },

  // Version Management
  uploadNewVersion: async (req, res) => {
    console.log('[DEBUG] uploadNewVersion controller hit');
    try {
      console.log('--- Start uploadNewVersion ---');
      const { version_name, release_notes } = req.body;
      console.log('Body:', { version_name, release_notes });
      
      if (!req.file) {
        console.error('No file uploaded');
        throw new Error('File APK harus diunggah.');
      }
      console.log('File:', req.file.filename);

      const apk_url = `/uploads/${req.file.filename}`;

      console.log('Deactivating old versions...');
      // Deactivate other versions
      await AppVersion.update({ is_active: false }, { where: { is_active: true } });

      console.log('Creating new version record...');
      // Create new version
      await AppVersion.create({
        version_name,
        release_notes,
        apk_url,
        is_active: true
      });

      console.log('Updating AppConfig...');
      // Update AppConfig mobile_app_version
      const config = await AppConfig.findOne();
      if (config) {
        await config.update({ mobile_app_version: version_name });
      } else {
        console.warn('AppConfig not found, creating default...');
        await AppConfig.create({ mobile_app_version: version_name });
      }

      console.log('Setting success message...');
      req.session.success_msg = `Versi ${version_name} berhasil diunggah dan diaktifkan.`;
      console.log('Done, redirecting...');
    } catch (error) {
      console.error('ERROR in uploadNewVersion:', error);
      await writeAppLog('error', 'Upload Version Error', error.stack, 'adminController.uploadNewVersion');
      if (req.session) {
        req.session.error_msg = 'Gagal mengunggah versi baru: ' + error.message;
      }
    }
    res.redirect('/admin/settings');
  },

  deleteVersion: async (req, res) => {
    console.log('[DEBUG] deleteVersion controller hit');
    try {
      const version = await AppVersion.findByPk(req.params.id);
      if (version) {
        // Delete file from disk
        const filePath = path.join(__dirname, '../public', version.apk_url);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
        await version.destroy();
        req.session.success_msg = 'Riwayat versi berhasil dihapus.';
      }
    } catch (error) {
      console.error(error);
      req.session.error_msg = 'Gagal menghapus riwayat versi.';
    }
    res.redirect('/admin/settings');
  },

  // Audit Logs
  listAuditLogs: async (req, res) => {
    console.log('[DEBUG] listAuditLogs controller hit');
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;

      const { count, rows: logs } = await AuditLog.findAndCountAll({
        include: [{ model: User, as: 'user' }],
        order: [['created_at', 'DESC']],
        limit,
        offset
      });

      const totalPages = Math.ceil(count / limit);

      res.render('admin/audit/index', { 
        logs,
        currentPage: page,
        totalPages,
        totalItems: count,
        limit
      });
    } catch (error) {
      await writeAppLog('error', 'Load Audit Logs Error', error.stack, 'adminController.listAuditLogs');
      res.redirect('/admin/dashboard');
    }
  },
  
  viewAuditLog: async (req, res) => {
    console.log('[DEBUG] viewAuditLog controller hit');
    try {
      const log = await AuditLog.findByPk(req.params.id, {
        include: [{ model: User, as: 'user' }]
      });
      if (!log) return res.redirect('/admin/audit');
      
      res.render('admin/audit/view', { log });
    } catch (error) {
      await writeAppLog('error', 'View Audit Log Error', error.stack, 'adminController.viewAuditLog');
      res.redirect('/admin/audit');
    }
  },

  listKeluarga: async (req, res) => {
    console.log('[DEBUG] listKeluarga controller hit');
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const search = req.query.search || '';

      const whereClause = {};
      if (search) {
        const { Op } = require('sequelize');
        whereClause.no_kk = { [Op.like]: `%${search}%` };
      }

      const allWarga = await Warga.findAll({
        where: whereClause,
        include: [Dusun],
        order: [['created_at', 'DESC']]
      });

      const keluargaMap = new Map();
      allWarga.forEach(w => {
        if (!keluargaMap.has(w.no_kk)) {
          keluargaMap.set(w.no_kk, {
            no_kk: w.no_kk,
            total_anggota: 0,
            nama_dusun: w.Dusun ? w.Dusun.nama_dusun : '-',
            created_at: w.created_at
          });
        }
        keluargaMap.get(w.no_kk).total_anggota++;
      });

      const allKeluarga = Array.from(keluargaMap.values());
      const count = allKeluarga.length;
      const totalPages = Math.ceil(count / limit);
      const keluarga = allKeluarga.slice((page - 1) * limit, page * limit);

      res.render('admin/keluarga/index', { 
        keluarga,
        currentPage: page,
        totalPages,
        totalItems: count,
        limit,
        search
      });
    } catch (error) {
      console.error('[DEBUG] listKeluarga error:', error);
      await writeAppLog('error', 'List Keluarga Error', error.stack, 'adminController.listKeluarga');
      req.session.error_msg = 'Terjadi kesalahan saat memuat data keluarga: ' + error.message;
      res.redirect('/admin/dashboard');
    }
  },

  viewKeluarga: async (req, res) => {
    console.log('[DEBUG] viewKeluarga controller hit');
    try {
      const { no_kk } = req.params;
      const anggota = await Warga.findAll({
        where: { no_kk },
        include: [Dusun, { model: User, as: 'creator' }]
      });
      
      if (anggota.length === 0) return res.redirect('/admin/keluarga');
      
      res.render('admin/keluarga/view', { no_kk, anggota, schema: getSchema() });
    } catch (error) {
      await writeAppLog('error', 'View Keluarga Error', error.stack, 'adminController.viewKeluarga');
      res.redirect('/admin/keluarga');
    }
  },

  // App Logs
  appLogsPage: async (req, res) => {
    try {
      const logs = await AppLog.findAll({
        order: [['created_at', 'DESC']],
        limit: 500 // Limit to prevent massive loads
      });
      res.render('admin/system_logs', { logs, debugMode: process.env.DEBUG === 'TRUE' });
    } catch (error) {
      console.error(error);
      res.redirect('/admin/dashboard');
    }
  },

  clearAppLogs: async (req, res) => {
    try {
      await AppLog.destroy({ where: {} });
      req.session.success_msg = 'App Logs berhasil dibersihkan.';
    } catch (error) {
      console.error(error);
      req.session.error_msg = 'Gagal membersihkan App Logs.';
    }
    res.redirect('/admin/app-logs');
  },

  // Dusun CRUD
  listDusun: async (req, res) => {
    try {
      const dusun = await Dusun.findAll();
      res.render('admin/dusun/index', { dusun });
    } catch (error) {
      await writeAppLog('error', 'List Dusun Error', error.stack, 'adminController.listDusun');
      res.redirect('/admin/dashboard');
    }
  },
  createDusun: async (req, res) => {
    try {
      await Dusun.create({ nama_dusun: req.body.nama_dusun });
      req.session.success_msg = 'Dusun created successfully';
    } catch (error) {
      await writeAppLog('error', 'Create Dusun Error', error.stack, 'adminController.createDusun');
      req.session.error_msg = 'Gagal menambah dusun.';
    }
    res.redirect('/admin/dusun');
  },
  deleteDusun: async (req, res) => {
    try {
      const dusunId = req.params.id;
      
      // Check if any users (petugas) are still assigned to this dusun
      const userCount = await User.count({ where: { dusun_id: dusunId } });
      if (userCount > 0) {
        req.session.error_msg = 'Gagal menghapus: Masih ada Petugas yang ditugaskan di dusun ini.';
        return res.redirect('/admin/dusun');
      }

      // Check if any citizens (warga) are still registered in this dusun
      const wargaCount = await Warga.count({ where: { dusun_id: dusunId } });
      if (wargaCount > 0) {
        req.session.error_msg = 'Gagal menghapus: Masih ada data Warga di dusun ini.';
        return res.redirect('/admin/dusun');
      }

      await Dusun.destroy({ where: { id: dusunId } });
      req.session.success_msg = 'Dusun deleted successfully';
    } catch (error) {
      console.error(error);
      await writeAppLog('error', 'Delete Dusun Error', error.stack, 'adminController.deleteDusun');
      req.session.error_msg = 'Terjadi kesalahan sistem saat menghapus data.';
    }
    res.redirect('/admin/dusun');
  },

  // Users (Petugas) CRUD
  listUsers: async (req, res) => {
    try {
      const users = await User.findAll({ 
        where: { role: 'petugas' },
        include: [Dusun]
      });
      const dusun = await Dusun.findAll();
      res.render('admin/users/index', { users, dusun });
    } catch (error) {
      await writeAppLog('error', 'List Users Error', error.stack, 'adminController.listUsers');
      res.redirect('/admin/dashboard');
    }
  },
  createUser: async (req, res) => {
    try {
      const { nama_lengkap, username, password, dusun_id } = req.body;
      const hashedPassword = await bcrypt.hash(password, 10);
      await User.create({
        nama_lengkap,
        username,
        password: hashedPassword,
        role: 'petugas',
        dusun_id: dusun_id || null
      });
      req.session.success_msg = 'Petugas berhasil ditambahkan.';
    } catch (error) {
      console.error(error);
      await writeAppLog('error', 'Create User Error', error.stack, 'adminController.createUser');
      req.session.error_msg = 'Gagal menambah petugas: ' + (error.name === 'SequelizeUniqueConstraintError' ? 'Username sudah digunakan.' : error.message);
    }
    res.redirect('/admin/users');
  },
  updateUser: async (req, res) => {
    try {
      const { nama_lengkap, username, password, dusun_id } = req.body;
      const updateData = { 
        nama_lengkap, 
        username, 
        dusun_id: dusun_id || null 
      };
      
      if (password && password.trim() !== '') {
        const hashedPassword = await bcrypt.hash(password, 10);
        updateData.password = hashedPassword;
      }

      await User.update(updateData, { where: { id: req.params.id } });
      req.session.success_msg = 'Data petugas berhasil diperbarui.';
    } catch (error) {
      console.error(error);
      await writeAppLog('error', 'Update User Error', error.stack, 'adminController.updateUser');
      req.session.error_msg = 'Gagal memperbarui petugas: ' + (error.name === 'SequelizeUniqueConstraintError' ? 'Username sudah digunakan.' : error.message);
    }
    res.redirect('/admin/users');
  },
  deleteUser: async (req, res) => {
    try {
      await User.destroy({ where: { id: req.params.id } });
      req.session.success_msg = 'Petugas berhasil dihapus.';
    } catch (error) {
      console.error(error);
      await writeAppLog('error', 'Delete User Error', error.stack, 'adminController.deleteUser');
      let msg = 'Gagal menghapus petugas.';
      if (error.name === 'SequelizeForeignKeyConstraintError') {
        msg = 'Gagal menghapus: Petugas ini memiliki data (warga/log) yang terkait.';
      }
      req.session.error_msg = msg;
    }
    res.redirect('/admin/users');
  },

  // Warga CRUD
  listWarga: async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;
      const search = req.query.search || '';

      const whereClause = {};
      if (search) {
        const { Op } = require('sequelize');
        whereClause[Op.or] = [
          { nik: { [Op.like]: `%${search}%` } },
          { nama_lengkap: { [Op.like]: `%${search}%` } }
        ];
      }

      const { count, rows: warga } = await Warga.findAndCountAll({
        where: whereClause,
        include: [Dusun, { model: User, as: 'creator' }],
        limit,
        offset,
        order: [['created_at', 'DESC']]
      });

      const totalPages = Math.ceil(count / limit);

      res.render('admin/warga/index', { 
        warga, 
        currentPage: page, 
        totalPages, 
        totalItems: count,
        limit,
        search
      });
    } catch (error) {
      await writeAppLog('error', 'List Warga Error', error.stack, 'adminController.listWarga');
      res.redirect('/admin/dashboard');
    }
  },
  addWarga: async (req, res) => {
    try {
      const dusunList = await Dusun.findAll();
      const schema = getSchema();
      const old_warga = req.session.old_warga || {};
      delete req.session.old_warga;
      
      res.render('admin/warga/add', { dusun: dusunList, schema, warga: old_warga });
    } catch (error) {
      await writeAppLog('error', 'Add Warga Page Error', error.stack, 'adminController.addWarga');
      res.redirect('/admin/warga');
    }
  },
  createWarga: async (req, res) => {
    console.log('[DEBUG] createWarga start');
    console.log('[DEBUG] req.body:', JSON.stringify(req.body));
    try {
      const schema = getSchema();
      const data = { ...req.body, created_by: req.session.user.id };
      
      // Handle dynamic fields based on schema
      schema.sections.forEach(section => {
        section.fields.forEach(field => {
          if (field.type === 'checkbox_group') {
            data[field.name] = JSON.stringify(req.body[field.name] || []);
          }
        });
      });

      console.log('[DEBUG] data to create:', JSON.stringify(data));
      const warga = await Warga.create(data);
      console.log('[DEBUG] warga created:', warga.id);
      await logActivity(req.session.user.id, 'CREATE', warga.id, warga.nama_lengkap, null, data);

      req.session.success_msg = 'Warga added successfully';
      res.redirect('/admin/warga');
    } catch (error) {
      console.error('[DEBUG] createWarga error:', error);
      await writeAppLog('error', 'Create Warga Error', error.stack, 'adminController.createWarga');
      
      let error_msg = error.message;
      if (error.name === 'SequelizeUniqueConstraintError') {
        error_msg = 'NIK sudah terdaftar dalam sistem.';
      } else if (error.name === 'SequelizeValidationError') {
        error_msg = error.errors.map(e => e.message).join(', ');
      }
      
      req.session.error_msg = error_msg;
      req.session.old_warga = req.body;
      res.redirect('/admin/warga/add');
    }
  },
  editWarga: async (req, res) => {
    try {
      const wargaData = await Warga.findByPk(req.params.id);
      if (!wargaData) return res.redirect('/admin/warga');
      
      const dusun = await Dusun.findAll();
      const schema = getSchema();
      
      const warga = wargaData.toJSON();

      // Parse JSON strings for checkboxes based on schema
      schema.sections.forEach(section => {
        section.fields.forEach(field => {
          if (field.type === 'checkbox_group') {
            warga[field.name] = JSON.parse(warga[field.name] || '[]');
          }
        });
      });

      // Override with old input if available
      const old_warga = req.session.old_warga || {};
      delete req.session.old_warga;
      
      const finalWarga = { ...warga, ...old_warga };

      res.render('admin/warga/edit', { warga: finalWarga, dusun, schema });
    } catch (error) {
      await writeAppLog('error', 'Edit Warga Page Error', error.stack, 'adminController.editWarga');
      res.redirect('/admin/warga');
    }
  },
  updateWarga: async (req, res) => {
    console.log('[DEBUG] updateWarga start, ID:', req.params.id);
    console.log('[DEBUG] req.body:', JSON.stringify(req.body));
    try {
      const schema = getSchema();
      const data = { ...req.body };
      
      const oldWarga = await Warga.findByPk(req.params.id);
      if (!oldWarga) {
        console.error('[DEBUG] oldWarga not found');
        return res.redirect('/admin/warga');
      }
      
      // Handle dynamic fields based on schema
      schema.sections.forEach(section => {
        section.fields.forEach(field => {
          if (field.type === 'checkbox_group') {
            data[field.name] = JSON.stringify(req.body[field.name] || []);
          }
        });
      });

      console.log('[DEBUG] data to update:', JSON.stringify(data));
      await Warga.update(data, { where: { id: req.params.id } });
      console.log('[DEBUG] update successful');
      await logActivity(req.session.user.id, 'UPDATE', req.params.id, data.nama_lengkap || oldWarga.nama_lengkap, oldWarga.toJSON(), data);
      
      req.session.success_msg = 'Warga updated successfully';
      res.redirect('/admin/warga');
    } catch (error) {
      console.error('[DEBUG] updateWarga error:', error);
      await writeAppLog('error', 'Update Warga Error', error.stack, 'adminController.updateWarga');
      
      let error_msg = error.message;
      if (error.name === 'SequelizeUniqueConstraintError') {
        error_msg = 'NIK sudah terdaftar dalam sistem.';
      } else if (error.name === 'SequelizeValidationError') {
        error_msg = error.errors.map(e => e.message).join(', ');
      }
      
      req.session.error_msg = error_msg;
      req.session.old_warga = req.body;
      res.redirect(`/admin/warga/edit/${req.params.id}`);
    }
  },
  viewWarga: async (req, res) => {
    try {
      const warga = await Warga.findByPk(req.params.id, { include: [Dusun, { model: User, as: 'creator' }] });
      if (warga) {
        const schema = getSchema();
        schema.sections.forEach(section => {
          section.fields.forEach(field => {
            if (field.type === 'checkbox_group') {
              warga[field.name] = JSON.parse(warga[field.name] || '[]');
            }
          });
        });
      }
      res.render('admin/warga/view', { warga, schema: getSchema() });
    } catch (error) {
      await writeAppLog('error', 'View Warga Error', error.stack, 'adminController.viewWarga');
      res.redirect('/admin/warga');
    }
  },
  deleteWarga: async (req, res) => {
    try {
      const oldWarga = await Warga.findByPk(req.params.id);
      if(oldWarga) {
        await Warga.destroy({ where: { id: req.params.id } });
        await logActivity(req.session.user.id, 'DELETE', oldWarga.id, oldWarga.nama_lengkap, oldWarga.toJSON(), null);
      }
      req.session.success_msg = 'Data warga deleted successfully';
    } catch (error) {
      await writeAppLog('error', 'Delete Warga Error', error.stack, 'adminController.deleteWarga');
      req.session.error_msg = 'Gagal menghapus data warga.';
    }
    res.redirect('/admin/warga');
  },
  bulkDeleteWarga: async (req, res) => {
    try {
      const { ids } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        req.session.error_msg = 'Tidak ada data yang dipilih untuk dihapus.';
        return res.redirect('/admin/warga');
      }

      // Find all warga to be deleted for logging purposes
      const wargaList = await Warga.findAll({ where: { id: ids } });
      
      await Warga.destroy({ where: { id: ids } });

      // Log each deletion activity
      for (const warga of wargaList) {
        await logActivity(req.session.user.id, 'BULK_DELETE', warga.id, warga.nama_lengkap, warga.toJSON(), null);
      }

      req.session.success_msg = `${ids.length} data warga berhasil dihapus.`;
    } catch (error) {
      await writeAppLog('error', 'Bulk Delete Warga Error', error.stack, 'adminController.bulkDeleteWarga');
      req.session.error_msg = 'Gagal menghapus data warga terpilih.';
    }
    res.redirect('/admin/warga');
  }
};

