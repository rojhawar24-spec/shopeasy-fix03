// Set production mode before dotenv or application modules are imported.
// Works with the default npm shell on Windows, macOS and Linux.
process.env.NODE_ENV = 'production';
await import('../src/bootstrap.js');
