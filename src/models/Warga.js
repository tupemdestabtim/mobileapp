const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const User = require('./User');
const Dusun = require('./Dusun');
const fs = require('fs');
const path = require('path');

// Helper to get schema fields
function getSchemaFields() {
  try {
    const schemaPath = path.join(__dirname, '../../form-schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const fields = {};
    
    schema.sections.forEach(section => {
      section.fields.forEach(field => {
        // Skip 'dusun' as it's handled via 'dusun_id' relationship
        if (field.name === 'dusun') return;
        
        let type = DataTypes.STRING;
        if (field.type === 'number') type = DataTypes.INTEGER;
        if (field.type === 'date') type = DataTypes.DATEONLY;
        if (field.type === 'textarea' || field.type === 'checkbox_group') type = DataTypes.TEXT;
        
        fields[field.name] = {
          type: type,
          allowNull: true // Dynamic fields are usually optional at DB level
        };
      });
    });
    return fields;
  } catch (error) {
    console.error('Error loading schema for Warga model:', error);
    return {};
  }
}

const dynamicFields = getSchemaFields();

const Warga = sequelize.define('Warga', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  // Merge dynamic fields with core fields
  ...dynamicFields,
  
  // Ensure core identity fields have correct constraints if not fully defined in schema
  nik: { type: DataTypes.STRING(16), unique: true, allowNull: false },
  no_kk: { type: DataTypes.STRING(16), allowNull: false },
  nama_lengkap: { type: DataTypes.STRING, allowNull: false },
  
  // Relationship fields
  dusun_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: Dusun, key: 'id' }
  },
  created_by: {
    type: DataTypes.INTEGER,
    references: { model: User, key: 'id' }
  }
}, {
  tableName: 'warga',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'update_at',
});

Warga.belongsTo(Dusun, { foreignKey: 'dusun_id' });
Warga.belongsTo(User, { foreignKey: 'created_by', as: 'creator' });

module.exports = Warga;
