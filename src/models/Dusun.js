const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Dusun = sequelize.define('Dusun', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  nama_dusun: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'dusun',
  timestamps: false,
});

module.exports = Dusun;
