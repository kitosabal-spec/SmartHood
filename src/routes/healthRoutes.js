const express = require('express');

function createHealthRoutes({ asyncHandler, healthController }) {
  const router = express.Router();
  router.get('/health', asyncHandler(healthController));
  return router;
}

module.exports = { createHealthRoutes };
