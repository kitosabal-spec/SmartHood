'use strict';

async function up(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS disbursements (
    id VARCHAR(64) PRIMARY KEY,
    expense_category VARCHAR(100) NOT NULL,
    transaction_date DATE NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    voided_at DATETIME(3) NULL,
    voided_by VARCHAR(64) NULL,
    INDEX idx_disbursement_date (voided_at, transaction_date),
    INDEX idx_disbursement_category (expense_category, transaction_date),
    CONSTRAINT chk_disbursement_amount CHECK (amount > 0)
  ) ENGINE=InnoDB`);
}

module.exports = { up };
