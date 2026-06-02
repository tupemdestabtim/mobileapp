const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const LoginLog = sequelize.define('LoginLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: User, key: 'id' }
  },
  device_id: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  ip: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  integrity: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'login_logs',
  timestamps: true,
  createdAt: 'login_at',
  updatedAt: false,
});

LoginLog.belongsTo(User, { foreignKey: 'user_id' });

module.exports = LoginLog;
