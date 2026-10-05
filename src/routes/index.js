function registerPageRoutes(app, { indexController }) {
  app.get(['/', '/index.html'], indexController);
}

module.exports = { registerPageRoutes };
