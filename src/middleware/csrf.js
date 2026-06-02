const { csrfSync } = require('csrf-sync');

const {
  csrfSynchronisedProtection,
  generateToken,
} = csrfSync({
  getTokenFromRequest: (req) => {
    // Note: req.query['_csrf'] is restored to support multipart/form-data uploads
    return (req.body && req.body['_csrf']) || (req.query && req.query['_csrf']) || req.headers['x-csrf-token'];
  },
});

const csrfMiddleware = [
  csrfSynchronisedProtection,
  (req, res, next) => {
    res.locals.csrfToken = generateToken(req);
    next();
  }
];

module.exports = {
  csrfMiddleware
};
