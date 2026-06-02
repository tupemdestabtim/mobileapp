const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const AppLog = sequelize.define('AppLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  level: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'error'
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  stack_trace: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  source: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'app_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = AppLog;