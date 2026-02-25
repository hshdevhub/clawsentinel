import winston from 'winston';
import path from 'path';
import os from 'os';
import fs from 'fs';

const LOG_DIR = path.join(os.homedir(), '.clawsentinel', 'logs');
fs.mkdirSync(LOG_DIR, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

const lineFormat = printf(({ level, message, timestamp, module, ...meta }) => {
  const mod = module ? `[${module}] ` : '';
  const extra = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level}: ${mod}${message}${extra}`;
});

export const logger = winston.createLogger({
  level: process.env['LOG_LEVEL'] ?? 'info',
  format: combine(
    errors({ stack: true }),
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    lineFormat
  ),
  transports: [
    // Console: pretty output for CLI users
    new winston.transports.Console({
      format: combine(
        colorize({ all: true }),
        timestamp({ format: 'HH:mm:ss' }),
        lineFormat
      )
    }),
    // Rolling file: full structured audit trail
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'clawsentinel.log'),
      maxsize: 10 * 1024 * 1024, // 10 MB
      maxFiles: 5,
      tailable: true
    }),
    // Separate file for errors only
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 3
    })
  ]
});

export function moduleLogger(moduleName: string): winston.Logger {
  return logger.child({ module: moduleName });
}
