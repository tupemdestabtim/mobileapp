const mysql = require('mysql2/promise');
const sequelize = require('./database');
const User = require('../models/User');
const Dusun = require('../models/Dusun');
const Warga = require('../models/Warga');
const AuditLog = require('../models/AuditLog');
const DashboardWidget = require('../models/DashboardWidget');
const AppConfig = require('../models/AppConfig');
const AppLog = require('../models/AppLog');
const AppVersion = require('../models/AppVersion');
const LoginLog = require('../models/LoginLog');
const ActivityLog = require('../models/ActivityLog');
const SecurityLog = require('../models/SecurityLog');
const bcrypt = require('bcryptjs');

async function initDB() {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME}\`;`);
    await connection.end();

    await sequelize.authenticate();
    console.log('Database connection established.');

    await sequelize.sync({ alter: true });
    console.log('Models synced.');

    // Ensure default config exists
    const configCount = await AppConfig.count();
    if (configCount === 0) {
      await AppConfig.create({
        app_title: 'MOLANIHU',
        village_name: 'Desa Molanihu',
        welcome_message: 'Sistem Pendataan Penduduk Terpadu',
        mobile_app_version: '1.0.0'
      });
      console.log('Default App Config created.');
    }

    // Check if admin exists
    // Check if admin exists
    const adminCount = await User.count({ where: { role: 'admin' } });
    if (adminCount === 0) {
      const crypto = require('crypto');
      const randomPassword = crypto.randomBytes(8).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      await User.create({
        nama_lengkap: 'Administrator',
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
      });
      console.log('----------------------------------------------------');
      console.log(`Default admin created.`);
      console.log(`Username: admin`);
      console.log(`Password: ${randomPassword}`);
      console.log('WARNING: Harap catat password ini, tidak akan ditampilkan lagi!');
      console.log('----------------------------------------------------');
    }
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

initDB();
