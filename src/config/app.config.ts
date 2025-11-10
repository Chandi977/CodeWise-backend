export const appConfig = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  apiPrefix: '/api/v1',

  // File upload
  uploadDir: 'uploads',
  maxFileSize: 100 * 1024 * 1024, // 100MB

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,
  },

  // JWT
  jwt: {
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    resetTokenExpiry: '1h',
  },

  // Analysis
  analysis: {
    maxConcurrent: 3,
    timeout: 30 * 60 * 1000, // 30 minutes
  },

  // AI
  ai: {
    defaultProvider: 'openai',
    timeout: 60000,
    maxRetries: 3,
  },
};
