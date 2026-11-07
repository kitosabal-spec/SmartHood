const { PORT, DB_CONFIG } = require('./config/environment');
const { app, initializeApp, isEmailConfigured, emailQueue } = require('./app');

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

initializeApp()
  .then(() => {
    const server = app.listen(PORT, () => {
      console.log(`SmartHood is running at http://localhost:${PORT}`);
      console.log(`MySQL database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
      console.log(isEmailConfigured()
        ? 'Email notifications: configured'
        : 'Email notifications: disabled (set SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM)');
    });
    let closing = false;
    const shutdown = async () => {
      if (closing) return;
      closing = true;
      await Promise.all([new Promise(resolve => server.close(resolve)), emailQueue.stop()]);
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  })
  .catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
