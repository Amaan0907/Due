const { pool } = require('../config/db.js')

// The group's ledger as edges: "debtor owes creditor amount", one row per (debtor, creditor).
// Expense split: the participant owes the payer their share (the payer's own share is skipped).
// Settlement from X to Y: X paid Y, written as "Y owes X" so it cancels X's debt.
// Deleted expenses are skipped. Balances are never stored, always computed from here.
async function ledgerEdges(groupId, db = pool) {
    const { rows } = await db.query(
        `SELECT debtor, creditor, SUM(amount)::bigint AS amount_cents
        FROM (
            SELECT s.user_id AS debtor, e.paid_by AS creditor, s.share_cents AS amount
            FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
            WHERE e.group_id = $1 AND e.deleted_at IS NULL AND s.user_id <> e.paid_by
            UNION ALL
            SELECT to_user_id, from_user_id, amount_cents
            FROM settlements WHERE group_id = $1
        ) ledger
        GROUP BY debtor, creditor`,
        [groupId]
    )
    return rows.map((r) => ({ debtor: r.debtor, creditor: r.creditor, amountCents: r.amount_cents }))
}

// One user's net balance in each of their groups:
// what they paid - their own shares + settlements they paid - settlements they received.
// Pass groupId to get a single group. Returns Map(groupId -> netCents); a missing group means 0.
async function netForUser(userId, groupId = null, db = pool) {
    const { rows } = await db.query(
        `SELECT group_id, SUM(delta)::bigint AS net_cents
        FROM (
            SELECT group_id, amount_cents AS delta
            FROM expenses WHERE paid_by = $1 AND deleted_at IS NULL
            UNION ALL
            SELECT e.group_id, -s.share_cents
            FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
            WHERE s.user_id = $1 AND e.deleted_at IS NULL
            UNION ALL
            SELECT group_id, amount_cents FROM settlements WHERE from_user_id = $1
            UNION ALL
            SELECT group_id, -amount_cents FROM settlements WHERE to_user_id = $1
        ) ledger
        WHERE $2::bigint IS NULL OR group_id = $2
        GROUP BY group_id`,
        [userId, groupId]
    )
    return new Map(rows.map((r) => [r.group_id, r.net_cents]))
}

// Names for everyone who can appear in the balances: current members plus `userIds`
// (people in the ledger who may have left). Returns Map(userId -> { user, isMember }).
async function people(groupId, userIds, db = pool) {
    const { rows } = await db.query(
        `SELECT u.id, u.name, (gm.user_id IS NOT NULL) AS is_member
        FROM users u
        LEFT JOIN group_members gm ON gm.group_id = $1 AND gm.user_id = u.id
        WHERE gm.user_id IS NOT NULL OR u.id = ANY($2::bigint[])`,
        [groupId, userIds]
    )
    return new Map(rows.map((r) => [r.id, { user: { id: r.id, name: r.name }, isMember: r.is_member }]))
}

module.exports = { ledgerEdges, netForUser, people }
