const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Dusun = require('./Dusun');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  nama_lengkap: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('admin', 'petugas'),
    allowNull: false,
  },
  dusun_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: Dusun,
      key: 'id',
    },
  },
}, {
  tableName: 'users',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'update_at',
});

User.belongsTo(Dusun, { foreignKey: 'dusun_id' });
Dusun.hasMany(User, { foreignKey: 'dusun_id' });

module.exports = User;
