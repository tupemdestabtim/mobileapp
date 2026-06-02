const jwt = require('jsonwebtoken');

module.exports = {
  isAdmin: (req, res, next) => {
    console.log(`[DEBUG] isAdmin check for: ${req.originalUrl}`);
    console.log(`[DEBUG] Session User:`, req.session.user);
    // Check session existence and explicit admin role
    if (req.session && req.session.user && req.session.user.role === 'admin') {
      return next();
    }
    
    // Log unauthorized access attempts
    console.warn(`[AUTH] Unauthorized access attempt to ${req.originalUrl} from IP ${req.ip}`);
    
    if (req.xhr || req.path.startsWith('/api/')) {
      return res.status(401).json({ message: 'Session expired or unauthorized' });
    }
    res.redirect('/admin/login');
  },
  
  apiAuth: (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ message: 'Token missing' });
    }
    
    jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] }, (err, user) => {
      if (err) {
        console.error('[AUTH] JWT Verification failed:', err.message);
        return res.status(403).json({ message: 'Invalid or expired token' });
      }
      
      // Ensure user has necessary fields
      if (!user.id || !user.role) {
        return res.status(403).json({ message: 'Malformed token payload' });
      }

      req.user = user;
      next();
    });
  }
};
