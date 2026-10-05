const { PORT, DB_CONFIG } = require('./config/environment');
const { app, initializeApp, isEmailConfigured } = require('./app');

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

initializeApp()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`SmartHood is running at http://localhost:${PORT}`);
      console.log(`MySQL database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
      console.log(isEmailConfigured()
        ? 'Email notifications: configured'
        : 'Email notifications: disabled (set SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM)');
    });
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
  });
