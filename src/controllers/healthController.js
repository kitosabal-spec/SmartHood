function createHealthController({ get, databaseConfig }) {
  return async function healthController(req, res) {
    const row = await get('SELECT COUNT(*) AS users FROM users');
    res.json({
      ok: true,
      database: databaseConfig.database,
      host: databaseConfig.host,
      port: databaseConfig.port,
      users: Number(row.users),
    });
  };
}

module.exports = { createHealthController };
