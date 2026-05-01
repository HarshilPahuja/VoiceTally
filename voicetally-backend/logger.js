const winston = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Standard log format
const logFormat = printf(({ level, message, timestamp, stack }) => {
    return `[${timestamp}] ${level}: ${stack || message}`;
});

// Configure the Winston Logger
const logger = winston.createLogger({
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    format: combine(
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat
    ),
    transports: [
        // Output all logs to console with colors
        new winston.transports.Console({
            format: combine(
                colorize(),
                logFormat
            )
        }),
        // Output all logs to backend.log
        new winston.transports.File({
            filename: path.join(__dirname, 'backend.log')
        })
    ]
});

module.exports = logger;
