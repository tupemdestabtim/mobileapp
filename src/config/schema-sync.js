const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');

async function syncTableWithSchema() {
    console.log('Starting Database Schema Sync...');
    const schemaPath = path.join(__dirname, '../../form-schema.json');
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    
    // Extract all field names from schema
    const schemaFields = [];
    schema.sections.forEach(section => {
        section.fields.forEach(field => {
            // Skip 'dusun' as it maps to 'dusun_id' (foreign key)
            if (field.name === 'dusun') return;

            // Validasi ketat nama kolom: Hanya alfanumerik & garis bawah, max 63 chars (aturan MySQL)
            if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(field.name)) {
                throw new Error(`Validasi gagal: Nama kolom '${field.name}' tidak valid atau berpotensi bahaya.`);
            }
            
            schemaFields.push({
                name: field.name,
                type: field.type
            });
        });
    });

    // Technical columns that should never be dropped
    const protectedColumns = [
        'id', 'dusun_id', 'created_at', 'update_at', 'created_by',
        'nik', 'no_kk', 'nama_lengkap', 'kelompok_rentan' // Core data columns
    ];

    // 1. Get current columns from DB
    const [results] = await sequelize.query("DESCRIBE warga");
    if (!results || !Array.isArray(results)) {
        throw new Error("Gagal mengambil struktur tabel 'warga'.");
    }
    const currentColumns = results.map(r => r.Field);
    console.log(`Current columns in DB: ${currentColumns.join(', ')}`);

    // 2. Add missing columns
    for (const field of schemaFields) {
        if (!currentColumns.includes(field.name) && !protectedColumns.includes(field.name)) {
            let columnType = "VARCHAR(255)";
            if (field.type === 'date') columnType = "DATE";
            if (field.type === 'number') columnType = "INT";
            if (field.type === 'textarea' || field.type === 'checkbox_group') columnType = "TEXT";
            
            console.log(`Adding missing column: ${field.name} (${columnType})`);
            await sequelize.query(`ALTER TABLE warga ADD COLUMN \`${field.name}\` ${columnType} NULL`);
        }
    }

    // 3. Drop unused columns (only if they are empty and not in schema/protected)
    const schemaFieldNames = schemaFields.map(f => f.name);
    for (const column of currentColumns) {
        if (!protectedColumns.includes(column) && !schemaFieldNames.includes(column)) {
            // Check if column has any data
            const [dataCheck] = await sequelize.query(`SELECT COUNT(*) as count FROM warga WHERE \`${column}\` IS NOT NULL AND \`${column}\` != ''`);
            if (dataCheck && dataCheck[0] && dataCheck[0].count === 0) {
                console.log(`Dropping unused empty column: ${column}`);
                await sequelize.query(`ALTER TABLE warga DROP COLUMN \`${column}\``);
            } else {
                console.log(`Keeping column '${column}' because it contains data or is manually protected.`);
            }
        }
    }
    
    console.log('Database Schema Sync completed successfully.');
    return { success: true };
}

module.exports = { syncTableWithSchema };
