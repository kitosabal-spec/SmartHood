'use strict';

const NOW_MS = 'CAST(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3)) * 1000 AS UNSIGNED)';

async function transaction(getPool, work) {
  const connection = await getPool().getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// Shared, atomic fixed windows. Only failed credentials call increment for
// login; successful/in-flight requests never temporarily consume a slot.
class MySqlRateLimitStore {
  constructor(getPool, scope) {
    this.getPool = getPool;
    this.scope = scope;
    this.prefix = `${scope}:`;
    this.localKeys = false;
  }

  init(options) { this.windowMs = options.windowMs; }

  async get(key) {
    const [rows] = await this.getPool().execute(
      `SELECT hits, expires_at_ms FROM auth_rate_limits
       WHERE scope = ? AND bucket_key = ? AND expires_at_ms > ${NOW_MS}`,
      [this.scope, key]
    );
    return rows[0] ? this.result(rows[0]) : undefined;
  }

  result(row) {
    return { totalHits: Number(row.hits), resetTime: new Date(Number(row.expires_at_ms)) };
  }

  async increment(key) {
    return transaction(this.getPool, async connection => {
      await connection.execute(
        `INSERT INTO auth_rate_limits (scope, bucket_key, hits, expires_at_ms)
         VALUES (?, ?, 1, ${NOW_MS} + ?)
         ON DUPLICATE KEY UPDATE
           hits = IF(expires_at_ms <= ${NOW_MS}, 1, hits + 1),
           expires_at_ms = IF(expires_at_ms <= ${NOW_MS}, ${NOW_MS} + ?, expires_at_ms)`,
        [this.scope, key, this.windowMs, this.windowMs]
      );
      const [rows] = await connection.execute(
        'SELECT hits, expires_at_ms FROM auth_rate_limits WHERE scope = ? AND bucket_key = ?',
        [this.scope, key]
      );
      return this.result(rows[0]);
    });
  }

  async decrement(key) {
    await this.getPool().execute(
      'UPDATE auth_rate_limits SET hits = GREATEST(0, hits - 1) WHERE scope = ? AND bucket_key = ?',
      [this.scope, key]
    );
  }

  async resetKey(key) {
    await this.getPool().execute('DELETE FROM auth_rate_limits WHERE scope = ? AND bucket_key = ?', [this.scope, key]);
  }
}

function createAuthSecurityRepository(getPool) {
  return {
    async initialize() {
      const pool = getPool();
      await pool.execute(`CREATE TABLE IF NOT EXISTS auth_rate_limits (
        scope VARCHAR(32) NOT NULL,
        bucket_key CHAR(64) NOT NULL,
        hits INT UNSIGNED NOT NULL,
        expires_at_ms BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY (scope, bucket_key), INDEX (expires_at_ms)
      ) ENGINE=InnoDB`);
      await pool.execute(`CREATE TABLE IF NOT EXISTS auth_security_events (
        event_key CHAR(64) PRIMARY KEY,
        user_id VARCHAR(64) NULL,
        event_type VARCHAR(40) NOT NULL,
        occurred_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        email_status VARCHAR(20) NOT NULL,
        INDEX (occurred_at)
      ) ENGINE=InnoDB`);
      await pool.execute(`CREATE TABLE IF NOT EXISTS auth_security_email_cooldowns (
        user_id VARCHAR(64) NOT NULL,
        event_type VARCHAR(40) NOT NULL,
        expires_at_ms BIGINT UNSIGNED NOT NULL,
        PRIMARY KEY (user_id, event_type)
      ) ENGINE=InnoDB`);
    },

    // Event insertion and account/event-type claim commit together. A second
    // instance, IP, username alias, or limiter cannot claim the same alert.
    async claimEvent({ eventKey, userId, eventType, emailEnabled, cooldownMs }) {
      return transaction(getPool, async connection => {
        const initialStatus = !userId ? 'no_account' : emailEnabled ? 'suppressed' : 'disabled';
        const [insert] = await connection.execute(
          `INSERT IGNORE INTO auth_security_events (event_key, user_id, event_type, email_status)
           VALUES (?, ?, ?, ?)`, [eventKey, userId || null, eventType, initialStatus]
        );
        if (insert.affectedRows !== 1 || !userId || !emailEnabled) return false;
        await connection.execute(
          `INSERT IGNORE INTO auth_security_email_cooldowns (user_id, event_type, expires_at_ms)
           VALUES (?, ?, 0)`, [userId, eventType]
        );
        const [claim] = await connection.execute(
          `UPDATE auth_security_email_cooldowns SET expires_at_ms = ${NOW_MS} + ?
           WHERE user_id = ? AND event_type = ? AND expires_at_ms <= ${NOW_MS}`,
          [cooldownMs, userId, eventType]
        );
        if (claim.affectedRows !== 1) return false;
        await connection.execute(
          "UPDATE auth_security_events SET email_status = 'pending' WHERE event_key = ?", [eventKey]
        );
        return true;
      });
    },

    async markEmail(eventKey, status) {
      await getPool().execute('UPDATE auth_security_events SET email_status = ? WHERE event_key = ?', [status, eventKey]);
    },

    async prune() {
      await getPool().execute(`DELETE FROM auth_rate_limits WHERE expires_at_ms <= ${NOW_MS}`);
      await getPool().execute('DELETE FROM auth_security_events WHERE occurred_at < CURRENT_TIMESTAMP - INTERVAL 30 DAY');
      // Cooldown rows are bounded by the number of accounts and reused.
    },
  };
}

module.exports = { MySqlRateLimitStore, createAuthSecurityRepository };
