const Warga = require('../models/Warga');
const Dusun = require('../models/Dusun');
const { Sequelize, Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

function getSchema() {
  const schemaPath = path.join(__dirname, '../../form-schema.json');
  return JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
}

module.exports = {
  index: async (req, res) => {
    res.render('admin/reports/index');
  },

  demografi: async (req, res) => {
    try {
      const totalWarga = await Warga.count();
      const byGender = await Warga.findAll({
        attributes: ['jenis_kelamin', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
        group: ['jenis_kelamin']
      });

      const byAgama = await Warga.findAll({
        attributes: ['agama', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
        group: ['agama']
      });

      const byPendidikan = await Warga.findAll({
        attributes: ['pendidikan_terakhir', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
        group: ['pendidikan_terakhir']
      });

      const byDusun = await Warga.findAll({
        attributes: ['dusun_id', [Sequelize.fn('COUNT', Sequelize.col('Warga.id')), 'count']],
        include: [{ model: Dusun, attributes: ['nama_dusun'] }],
        group: ['dusun_id', 'Dusun.id'],
        raw: true,
        nest: true
      });

      res.render('admin/reports/demografi', {
        totalWarga,
        byGender,
        byAgama,
        byPendidikan,
        byDusun
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Gagal memuat laporan demografi.");
    }
  },

  sanitasi: async (req, res) => {
    try {
      const fields = ['sumber_air_minum', 'kualitas_air_minum', 'fasilitas_bab', 'jenis_kloset', 'pembuangan_akhir_tinja', 'pengelolaan_sampah'];
      const stats = {};

      for (const field of fields) {
        stats[field] = await Warga.findAll({
          attributes: [field, [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
          group: [field]
        });
      }

      res.render('admin/reports/sanitasi', { stats });
    } catch (error) {
      console.error(error);
      res.status(500).send("Gagal memuat laporan sanitasi.");
    }
  },

  kesehatan: async (req, res) => {
    try {
      const stats = {};
      
      // BPJS & Jaminan
      stats.jaminan = await Warga.findAll({
        attributes: ['jaminan_kesehatan', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
        group: ['jaminan_kesehatan']
      });

      // Penyakit Kronis (Multiple Choice - Checkbox)
      const allWarga = await Warga.findAll({ attributes: ['riwayat_penyakit_kronis', 'status_disabilitas'] });
      
      const penyakitCounts = {};
      const disabilitasCounts = {};

      allWarga.forEach(w => {
        // Disabilitas is select (single)
        const d = w.status_disabilitas || 'Tidak Ada';
        disabilitasCounts[d] = (disabilitasCounts[d] || 0) + 1;

        // Penyakit is checkbox group (array in JSON)
        try {
          const penyakit = JSON.parse(w.riwayat_penyakit_kronis || '[]');
          if (Array.isArray(penyakit)) {
            penyakit.forEach(p => {
              penyakitCounts[p] = (penyakitCounts[p] || 0) + 1;
            });
          }
        } catch (e) {}
      });

      // Akseptor KB (Target: P, age 18-49)
      stats.kb = await Warga.findAll({
        where: {
          jenis_kelamin: 'P',
          umur: { [Op.between]: [18, 49] }
        },
        attributes: ['jenis_kb', [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
        group: ['jenis_kb']
      });

      res.render('admin/reports/kesehatan', { 
        stats, 
        penyakitCounts, 
        disabilitasCounts 
      });
    } catch (error) {
      console.error(error);
      res.status(500).send("Gagal memuat laporan kesehatan.");
    }
  },

  kesejahteraan: async (req, res) => {
    try {
      const stats = {};
      const fields = [
        'status_kepemilikan_rumah', 'jenis_lantai', 'jenis_dinding', 
        'jenis_atap', 'sumber_penerangan', 'bahan_bakar_memasak'
      ];

      for (const field of fields) {
        stats[field] = await Warga.findAll({
          attributes: [field, [Sequelize.fn('COUNT', Sequelize.col('id')), 'count']],
          group: [field]
        });
      }

      // Assets (Checkbox groups)
      const allWarga = await Warga.findAll({ attributes: ['aset_kendaraan', 'aset_elektronik'] });
      const kendaraanCounts = {};
      const elektronikCounts = {};

      allWarga.forEach(w => {
        try {
          const k = JSON.parse(w.aset_kendaraan || '[]');
          if (Array.isArray(k)) k.forEach(v => kendaraanCounts[v] = (kendaraanCounts[v] || 0) + 1);
          
          const e = JSON.parse(w.aset_elektronik || '[]');
          if (Array.isArray(e)) e.forEach(v => elektronikCounts[v] = (elektronikCounts[v] || 0) + 1);
        } catch (err) {}
      });

      res.render('admin/reports/kesejahteraan', { stats, kendaraanCounts, elektronikCounts });
    } catch (error) {
      console.error(error);
      res.status(500).send("Gagal memuat laporan kesejahteraan.");
    }
  },

  exportCSV: async (req, res) => {
    try {
      const ExcelJS = require('exceljs');
      const warga = await Warga.findAll({
        include: [Dusun],
        raw: true,
        nest: true
      });

      if (warga.length === 0) {
        return res.status(404).send("Tidak ada data untuk diekspor.");
      }

      const schema = getSchema();
      
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'MOLANIHU System';
      workbook.created = new Date();
      
      const worksheet = workbook.addWorksheet('Master Data Warga');

      // Define Headers
      const columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'NIK', key: 'nik', width: 25 },
        { header: 'No KK', key: 'no_kk', width: 25 },
        { header: 'Nama Lengkap', key: 'nama_lengkap', width: 30 },
        { header: 'Dusun', key: 'dusun', width: 20 }
      ];

      // Add dynamic fields to columns
      schema.sections.forEach(s => {
        s.fields.forEach(f => {
          if (f.name !== 'dusun') {
            columns.push({ header: f.label, key: f.name, width: 25 });
          }
        });
      });

      worksheet.columns = columns;

      // Style header row
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern:'solid',
        fgColor:{ argb:'FFD3D3D3' }
      };

      // Add Data Rows
      warga.forEach(w => {
        const rowData = {
          id: w.id,
          nik: `'${w.nik}`, // Force as text with prefix
          no_kk: `'${w.no_kk}`, // Force as text with prefix
          nama_lengkap: w.nama_lengkap,
          dusun: w.Dusun ? w.Dusun.nama_dusun : '-'
        };

        // Add dynamic fields
        schema.sections.forEach(s => {
          s.fields.forEach(f => {
            if (f.name !== 'dusun') {
              let val = w[f.name];
              
              if (val === null || val === undefined) {
                val = '-';
              } else if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
                try {
                  const parsed = JSON.parse(val);
                  val = Array.isArray(parsed) ? parsed.join('; ') : val;
                } catch (e) {}
              }
              rowData[f.name] = val;
            }
          });
        });

        worksheet.addRow(rowData);
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=master_data_warga.xlsx');
      
      await workbook.xlsx.write(res);
      res.end();
    } catch (error) {
      console.error(error);
      res.status(500).send("Gagal mengekspor data.");
    }
  }
};
