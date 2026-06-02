const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: User, key: 'id' }
  },
  action: {
    type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'SYNC_SCHEMA'),
    allowNull: false,
  },
  warga_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  warga_name: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  old_data: {
    type: DataTypes.TEXT, // Storing JSON as TEXT to avoid strict MySQL JSON requirements if not supported
    allowNull: true,
  },
  new_data: {
    type: DataTypes.TEXT,
    allowNull: true,
  }
}, {
  tableName: 'audit_logs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: false, // We only care when it was created
});

AuditLog.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = AuditLog;
