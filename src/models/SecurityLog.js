const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SecurityLog = sequelize.define('SecurityLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  event: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  device: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  risk: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'HIGH'
  },
  is_blocked: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'security_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false,
});

module.exports = SecurityLog;
