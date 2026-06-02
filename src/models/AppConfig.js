const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AppConfig = sequelize.define('AppConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  app_title: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'MOLANIHU',
  },
  village_name: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Desa Molanihu',
  },
  welcome_message: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Sistem Pendataan Penduduk Terpadu',
  },
  app_logo_url: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  mobile_app_version: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: '1.0.0',
  }
}, {
  tableName: 'app_configs',
  timestamps: true,
});

module.exports = AppConfig;
