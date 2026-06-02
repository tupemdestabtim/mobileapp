const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const DashboardWidget = sequelize.define('DashboardWidget', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  field_name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  chart_type: {
    type: DataTypes.ENUM('pie', 'doughnut', 'bar', 'line'),
    allowNull: false,
    defaultValue: 'bar',
  }
}, {
  tableName: 'dashboard_widgets',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = DashboardWidget;
