const User = require('../models/User');
const Dusun = require('../models/Dusun');
const Warga = require('../models/Warga');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { logActivity } = require('../utils/logger');
const AuditLog = require('../models/AuditLog');
const AppConfig = require('../models/AppConfig');
const AppVersion = require('../models/AppVersion');
const LoginLog = require('../models/LoginLog');
const ActivityLog = require('../models/ActivityLog');
const SecurityLog = require('../models/SecurityLog');

module.exports = {
  login: async (req, res) => {
    const { username, password, device_id, integrity } = req.body;
    try {
      const user = await User.findOne({ where: { username, role: 'petugas' }, include: [Dusun] });
      
      let loginStatus = 'FAILED';

      if (user && await bcrypt.compare(password, user.password)) {
        loginStatus = 'SUCCESS';
        const payload = { 
          id: user.id, 
          username: user.username, 
          role: user.role,
          dusun_id: user.dusun_id 
        };
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' }); // Short-lived Access Token
        const refreshToken = jwt.sign(payload, process.env.JWT_SECRET + '_refresh', { expiresIn: '7d' }); // Refresh Token

        // Log the successful login
        await LoginLog.create({
          user_id: user.id,
          device_id: device_id || 'UNKNOWN',
          ip: req.ip,
          integrity: integrity || 'UNVERIFIED'
        });

        res.json({
          message: 'Login successful',
          token,
          refreshToken,
          user: {
            id: user.id,
            nama_lengkap: user.nama_lengkap,
            username: user.username,
            dusun: user.Dusun ? user.Dusun.nama_dusun : null,
            dusun_id: user.dusun_id
          }
        });
      } else {
        // Log failed login with null user
        await LoginLog.create({
          user_id: null,
          device_id: device_id || 'UNKNOWN',
          ip: req.ip,
          integrity: integrity || 'FAILED_AUTH'
        });
        res.status(401).json({ message: 'Username atau password salah atau tidak terdaftar' });
      }
    } catch (error) {
      console.error('Login error', error);
      res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
  },

  addSecurityLog: async (req, res) => {
    try {
      const { type, details, device_id } = req.body;
      await SecurityLog.create({
        event: type || 'UNKNOWN_SECURITY_EVENT',
        device: device_id || req.ip,
        risk: 'HIGH' // Root/Emulator detection is generally high risk
      });
      res.status(200).send();
    } catch (e) {
      res.status(500).send();
    }
  },

  addActivityLog: async (req, res) => {
    try {
      const { action, location } = req.body;
      await ActivityLog.create({
        user_id: req.user.id,
        action: action,
        location: location || 'UNKNOWN'
      });
      res.status(200).send();
    } catch (e) {
      res.status(500).send();
    }
  },

  refreshToken: async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ message: 'Refresh token is required' });
    }

    jwt.verify(refreshToken, process.env.JWT_SECRET + '_refresh', { algorithms: ['HS256'] }, (err, decoded) => {
      if (err) {
        return res.status(403).json({ message: 'Invalid or expired refresh token' });
      }

      const payload = { 
        id: decoded.id, 
        username: decoded.username, 
        role: decoded.role, 
        dusun_id: decoded.dusun_id 
      };
      
      const newToken = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '15m' });
      const newRefreshToken = jwt.sign(payload, process.env.JWT_SECRET + '_refresh', { expiresIn: '7d' });

      res.json({ token: newToken, refreshToken: newRefreshToken });
    });
  },

  getSchema: async (req, res) => {
    try {
      const fs = require('fs');
      const path = require('path');
      const schemaPath = path.join(__dirname, '../../form-schema.json');
      if (!fs.existsSync(schemaPath)) {
        return res.status(404).json({ message: 'Schema file not found' });
      }
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      res.json(schema);
    } catch (error) {
      console.error('API getSchema error:', error);
      res.status(500).json({ message: 'Failed to load schema' });
    }
  },

  getAppConfig: async (req, res) => {
    try {
      const config = await AppConfig.findOne();
      const latestVersion = await AppVersion.findOne({ where: { is_active: true }, order: [['created_at', 'DESC']] });
      
      const response = config.toJSON();
      if (latestVersion) {
        response.mobile_app_version = latestVersion.version_name; // Overwrite with latest version
        response.latest_version = latestVersion.version_name;
        response.apk_url = latestVersion.apk_url;
        response.release_notes = latestVersion.release_notes;
      }

      res.json(response);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  listWarga: async (req, res) => {
    try {
      const { page = 1, limit = 20, search = '' } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const { Op } = require('sequelize');

      let whereClause = { dusun_id: req.user.dusun_id };

      if (search) {
        whereClause[Op.or] = [
          { nama_lengkap: { [Op.like]: `%${search}%` } },
          { nik: { [Op.like]: `%${search}%` } },
          { no_kk: { [Op.like]: `%${search}%` } } // Added no_kk search capability
        ];
      }

      const { count, rows } = await Warga.findAndCountAll({
        where: whereClause,
        include: [Dusun],
        order: [['created_at', 'DESC']],
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
      
      // Map result to include a flattened 'dusun' name field for easier mobile consumption
      const formatted = rows.map(w => {
        const item = w.toJSON();
        item.dusun = w.Dusun ? w.Dusun.nama_dusun : null;
        return item;
      });

      res.json({
        data: formatted,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalItems: count,
          totalPages: Math.ceil(count / parseInt(limit))
        }
      });
    } catch (error) {
      console.error('API listWarga error:', error);
      res.status(500).json({ message: error.message });
    }
  },

  getWargaById: async (req, res) => {
    try {
      const { id } = req.params;
      const warga = await Warga.findOne({
        where: { id, dusun_id: req.user.dusun_id },
        include: [Dusun]
      });
      if (!warga) return res.status(404).json({ message: 'Warga not found' });
      
      const item = warga.toJSON();
      item.dusun = warga.Dusun ? warga.Dusun.nama_dusun : null;
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  createWarga: async (req, res) => {
    try {
      console.log('Incoming createWarga request from user:', req.user.id);
      
      const data = { ...req.body, created_by: req.user.id, dusun_id: req.user.dusun_id };
      
      // Ensure specific numeric fields are typed correctly
      if (data.umur) data.umur = parseInt(data.umur);
      if (data.luas_lantai) data.luas_lantai = parseInt(data.luas_lantai);
      if (data.frekuensi_makan) data.frekuensi_makan = parseInt(data.frekuensi_makan);

      // Ensure arrays are stringified
      if (Array.isArray(data.riwayat_penyakit_kronis)) data.riwayat_penyakit_kronis = JSON.stringify(data.riwayat_penyakit_kronis);
      if (Array.isArray(data.kelompok_rentan)) data.kelompok_rentan = JSON.stringify(data.kelompok_rentan);
      if (Array.isArray(data.aset_kendaraan)) data.aset_kendaraan = JSON.stringify(data.aset_kendaraan);
      if (Array.isArray(data.aset_elektronik)) data.aset_elektronik = JSON.stringify(data.aset_elektronik);

      const warga = await Warga.create(data);
      await logActivity(req.user.id, 'CREATE', warga.id, warga.nama_lengkap, null, data);
      res.status(201).json(warga);
    } catch (error) {
      console.error('API createWarga error:', error);
      res.status(400).json({ message: error.message });
    }
  },

  updateWarga: async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body;
      
      const oldWarga = await Warga.findOne({ where: { id, dusun_id: req.user.dusun_id } });
      if (!oldWarga) return res.status(404).json({ message: 'Warga not found' });

      // Ensure numeric fields
      if (data.umur) data.umur = parseInt(data.umur);
      if (data.luas_lantai) data.luas_lantai = parseInt(data.luas_lantai);
      if (data.frekuensi_makan) data.frekuensi_makan = parseInt(data.frekuensi_makan);

      // Ensure arrays are stringified
      if (Array.isArray(data.riwayat_penyakit_kronis)) data.riwayat_penyakit_kronis = JSON.stringify(data.riwayat_penyakit_kronis);
      if (Array.isArray(data.kelompok_rentan)) data.kelompok_rentan = JSON.stringify(data.kelompok_rentan);
      if (Array.isArray(data.aset_kendaraan)) data.aset_kendaraan = JSON.stringify(data.aset_kendaraan);
      if (Array.isArray(data.aset_elektronik)) data.aset_elektronik = JSON.stringify(data.aset_elektronik);

      await Warga.update(data, { where: { id, dusun_id: req.user.dusun_id } });
      const updatedWarga = await Warga.findByPk(id);
      
      await logActivity(req.user.id, 'UPDATE', updatedWarga.id, updatedWarga.nama_lengkap, oldWarga.toJSON(), data);
      res.json(updatedWarga);
    } catch (error) {
      res.status(400).json({ message: error.message });
    }
  },

  deleteWarga: async (req, res) => {
    try {
      const { id } = req.params;
      const oldWarga = await Warga.findOne({ where: { id, dusun_id: req.user.dusun_id } });
      if (!oldWarga) return res.status(404).json({ message: 'Warga not found' });
      
      await Warga.destroy({ where: { id, dusun_id: req.user.dusun_id } });
      await logActivity(req.user.id, 'DELETE', oldWarga.id, oldWarga.nama_lengkap, oldWarga.toJSON(), null);
      res.json({ message: 'Warga deleted' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
};
