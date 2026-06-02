const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

const sanitizeData = (data) => {
  if (typeof data === 'string') {
    return DOMPurify.sanitize(data);
  }
  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item));
  }
  if (typeof data === 'object' && data !== null) {
    const sanitizedObj = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        sanitizedObj[key] = sanitizeData(data[key]);
      }
    }
    return sanitizedObj;
  }
  return data;
};

const xssClean = (req, res, next) => {
  if (req.body) {
    req.body = sanitizeData(req.body);
    // Security: Redact PII in console logs if debug is active
    if (process.env.DEBUG === 'TRUE') {
      const sanitizedLog = { ...req.body };
      if (sanitizedLog.nik) sanitizedLog.nik = '***REDACTED***';
      if (sanitizedLog.no_kk) sanitizedLog.no_kk = '***REDACTED***';
      console.log(`[DEBUG] Request Body:`, sanitizedLog);
    }
  }
  if (req.query) req.query = sanitizeData(req.query);
  if (req.params) req.params = sanitizeData(req.params);
  next();
};

module.exports = xssClean;
