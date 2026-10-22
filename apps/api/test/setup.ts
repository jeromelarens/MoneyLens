// Set environment variables for isolated test runs
process.env.NODE_ENV = 'test';
process.env.PORT = '4001';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/moneylens_test';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.LOG_LEVEL = 'silent';
