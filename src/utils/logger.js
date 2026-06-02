const AuditLog = require('../models/AuditLog');
const AppLog = require('../models/AppLog');
require('dotenv').config();

module.exports = {
  logActivity: async (userId, action, wargaId, wargaName, oldData = null, newData = null) => {
    try {
      await AuditLog.create({
        user_id: userId,
        action: action,
        warga_id: wargaId,
        warga_name: wargaName,
        old_data: oldData ? JSON.stringify(oldData) : null,
        new_data: newData ? JSON.stringify(newData) : null
      });
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  },
  
  writeAppLog: async (level, message, stackTrace = null, source = null) => {
    if (process.env.DEBUG === 'TRUE') {
      try {
        await AppLog.create({
          level,
          message,
          stack_trace: stackTrace,
          source
        });
      } catch (error) {
        console.error('Failed to write app log to database:', error);
      }
    }
  }
};
