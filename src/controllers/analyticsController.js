const Warga = require('../models/Warga');
const DashboardWidget = require('../models/DashboardWidget');
const { Sequelize } = require('sequelize');

module.exports = {
  // Get summary for dashboard
  getSummary: async (req, res) => {
    try {
      const whereClause = {};
      if (req.user && req.user.role !== 'admin') {
        whereClause.dusun_id = req.user.dusun_id;
      } else {
        const { dusun_id } = req.query;
        if (dusun_id) whereClause.dusun_id = dusun_id;
      }

      const { Op, fn, col } = require('sequelize');

      const totalWarga = await Warga.count({ where: whereClause });
      const totalLakiLaki = await Warga.count({ where: { ...whereClause, jenis_kelamin: 'L' } });
      const totalPerempuan = await Warga.count({ where: { ...whereClause, jenis_kelamin: 'P' } });
      const totalKK = await Warga.count({ 
        where: whereClause,
        distinct: true,
        col: 'no_kk'
      });
      const totalAnak = await Warga.count({ where: { ...whereClause, umur: { [Op.lt]: 15 } } });
      const totalLansia = await Warga.count({ where: { ...whereClause, umur: { [Op.gte]: 60 } } });
      const totalDewasa = totalWarga - totalAnak - totalLansia;

      res.json({
        totalWarga,
        totalLakiLaki,
        totalPerempuan,
        totalKK,
        totalAnak,
        totalDewasa,
        totalLansia
      });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Get all widgets for the dashboard
  getWidgets: async (req, res) => {
    try {
      const widgets = await DashboardWidget.findAll({ order: [['created_at', 'ASC']] });
      res.json(widgets);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Create a new widget
  createWidget: async (req, res) => {
    try {
      const { title, field_name, chart_type } = req.body;
      const widget = await DashboardWidget.create({ title, field_name, chart_type });
      res.json(widget);
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  },

  // Delete a widget
  deleteWidget: async (req, res) => {
    try {
      const { id } = req.params;
      console.log(`Attempting to delete widget with ID: ${id}`);
      
      const widget = await DashboardWidget.findByPk(id);
      if (!widget) {
        return res.status(404).json({ success: false, message: 'Grafik tidak ditemukan atau sudah dihapus.' });
      }

      await widget.destroy();
      console.log(`Successfully deleted widget with ID: ${id}`);
      res.json({ success: true, message: 'Grafik berhasil dihapus.' });
    } catch (error) {
      console.error('Error deleting widget:', error);
      res.status(500).json({ success: false, message: error.message });
    }
  },

  // Dynamic Aggregation Logic
  getAggregationData: async (req, res) => {
    try {
      const { field_name } = req.params;

      // Security: Validate field_name against schema to prevent arbitrary column selection
      const fs = require('fs');
      const path = require('path');
      const schemaPath = path.join(__dirname, '../../form-schema.json');
      const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
      
      const allowedFields = [];
      schema.sections.forEach(s => s.fields.forEach(f => allowedFields.push(f.name)));
      
      if (!allowedFields.includes(field_name)) {
        return res.status(400).json({ message: 'Invalid aggregation field' });
      }
      
      const whereClause = {};
      
      // Jika diakses via API Mobile oleh Petugas, paksa filter berdasarkan dusun petugas tersebut
      if (req.user && req.user.role !== 'admin') {
        whereClause.dusun_id = req.user.dusun_id;
      } else {
        // Jika diakses via Admin Web, izinkan filter opsional dari query
        const { dusun_id } = req.query;
        if (dusun_id) {
          whereClause.dusun_id = dusun_id;
        }
      }
      
      // Get all citizens data for this field with optional filtering
      const data = await Warga.findAll({
        attributes: [field_name],
        where: whereClause,
        raw: true
      });

      const counts = {};
      let total = 0;

      data.forEach(item => {
        let val = item[field_name];
        
        // Handle potential JSON strings (checkbox groups)
        if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
          try {
            val = JSON.parse(val);
          } catch (e) {}
        }

        if (Array.isArray(val)) {
          // Flatten arrays (e.g. ['motor', 'mobil'])
          val.forEach(v => {
            const label = v || 'Tidak Ada';
            counts[label] = (counts[label] || 0) + 1;
            total++;
          });
        } else {
          const label = val || 'Tidak Ada';
          counts[label] = (counts[label] || 0) + 1;
          total++;
        }
      });

      // Format for Chart.js
      const labels = Object.keys(counts);
      const values = Object.values(counts);
      const percentages = values.map(v => total > 0 ? ((v / total) * 100).toFixed(1) : 0);

      res.json({
        labels,
        values,
        percentages,
        total
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ message: error.message });
    }
  }
};
