const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { AppError } = require('../lib/errors');

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test', 
    handler: (req, res, next) =>
        next(new AppError(429, 'RATE_LIMITED', 'Too many attempts. Try again in a few minutes.')),
});

module.exports = { authLimiter };
