const express = require('express');
// Forced restart to ensure new routes are loaded - v3
const path = require('path');
const bodyParser = require('body-parser');
const cors = require('cors');
const session = require('express-session');
const SequelizeStore = require('connect-session-sequelize')(session.Store);
const sequelize = require('./config/database');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const xssClean = require('./middleware/xss');
const { writeAppLog } = require('./utils/logger');
require('dotenv').config();

const app = express();

app.disable('x-powered-by'); // Security: Hide Express
app.set('trust proxy', 1); // Trust first proxy for secure cookies

// Anti-Indexing & Bot Blocking
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet');
  next();
});

// Configure Sequelize Store for Sessions
const sessionStore = new SequelizeStore({
  db: sequelize,
  tableName: 'Sessions' // Explicit table name for sessions
});
sessionStore.sync(); // Create the session table if it doesn't exist

// Security Middlewares
app.use(xssClean);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "blob:", "https://ui-avatars.com"],
      connectSrc: ["'self'", "https://cdn.jsdelivr.net"],
      upgradeInsecureRequests: [], // Enforce HTTPS
    },
  },
  referrerPolicy: { policy: 'same-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Rate Limiting
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased from 100 to 500 to handle dashboard widget loads
  message: { message: 'Terlalu banyak request dari IP ini, coba lagi nanti.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// View Engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGIN : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

// Limit body size to prevent DoS
app.use(bodyParser.json({ limit: '100kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '100kb' }));

app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders: (res) => {
    res.set('X-Content-Type-Options', 'nosniff');
  }
}));

app.use(session({
  name: 'sessionId', // Simplified for better compatibility
  secret: process.env.SESSION_SECRET,
  store: sessionStore, // Use Database Store instead of MemoryStore
  resave: false,
  saveUninitialized: false, // Don't save empty sessions
  rolling: true, // Refresh session on every request
  cookie: { 
    maxAge: 2 * 60 * 60 * 1000, // 2 hours (shorter session for security)
    httpOnly: true, // Prevents client-side JS from accessing the cookie
    secure: process.env.NODE_ENV === 'production', // true for HTTPS only
    sameSite: 'Lax'
  }
}));

// Global variables for EJS
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.success_msg = req.session.success_msg || null;
  res.locals.error_msg = req.session.error_msg || null;
  
  // Default values for pagination and search to prevent ReferenceErrors
  res.locals.search = '';
  res.locals.currentPage = 1;
  res.locals.totalPages = 1;
  res.locals.totalItems = 0;
  res.locals.limit = 10;
  
  delete req.session.success_msg;
  delete req.session.error_msg;
  next();
});

// Routes
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

console.log('[DEBUG] Registering /admin routes...');
app.use('/admin', adminRoutes);
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.redirect('/admin/login');
});

// Error handling middleware
app.use(async (err, req, res, next) => {
  console.error(err.stack);
  await writeAppLog('error', err.message || 'Global Server Error', err.stack, req.originalUrl);
  res.status(500).json({ message: 'Internal Server Error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
