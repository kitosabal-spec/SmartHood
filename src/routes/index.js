function registerPageRoutes(app, { indexController }) {
  app.get(['/', '/index.html', '/terms-and-conditions', '/privacy-policy'], indexController);
}

module.exports = { registerPageRoutes };
