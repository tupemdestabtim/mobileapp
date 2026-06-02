const crypto = require('crypto');

// In-memory nonce store (for production, use Redis to share state across instances and handle expiry robustly)
const nonceCache = new Set();

// Clean up memory cache periodically (e.g. every 10 mins)
setInterval(() => {
    nonceCache.clear();
}, 10 * 60 * 1000);

const antiReplay = (req, res, next) => {
    // Only apply to POST, PUT, DELETE
    if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) return next();

    const timestamp = req.headers['x-timestamp'];
    const nonce = req.headers['x-nonce'];
    const signature = req.headers['x-signature'];

    if (!timestamp || !nonce || !signature) {
        return res.status(400).json({ message: 'Missing security headers. App update may be required.' });
    }

    // 1. Timestamp Validation (Max 5 minutes difference to prevent old replay)
    const now = Date.now();
    const requestTime = parseInt(timestamp, 10);
    if (isNaN(requestTime) || Math.abs(now - requestTime) > 5 * 60 * 1000) {
        return res.status(400).json({ message: 'Request expired. Please check device time.' });
    }

    // 2. Nonce Validation (Must be unique within the time window)
    if (nonceCache.has(nonce)) {
        return res.status(400).json({ message: 'Replay attack detected. Duplicate nonce.' });
    }
    nonceCache.add(nonce);

    // 3. Signature Validation (HMAC SHA256 of Path + Timestamp + Nonce)
    // Uses the API_SECRET as the shared symmetric key between Server and App
    const payload = req.originalUrl + timestamp + nonce;

    if (!process.env.API_SECRET) {
        console.error("[SECURITY WARNING] API_SECRET is not configured in .env!");
        return res.status(500).json({ message: 'Internal Server Configuration Error.' });
    }

    const expectedSignature = crypto.createHmac('sha256', process.env.API_SECRET)
        .update(payload)
        .digest('hex');

    if (signature !== expectedSignature) {
        return res.status(403).json({ message: 'Invalid request signature.' });
    }

    next();
};

module.exports = antiReplay;