const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');

const ActivityLog = sequelize.define('ActivityLog', {
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
    type: DataTypes.STRING,
    allowNull: false,
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'activity_logs',
  timestamps: true,
  createdAt: 'timestamp',
  updatedAt: false,
});

ActivityLog.belongsTo(User, { foreignKey: 'user_id' });

module.exports = ActivityLog;
