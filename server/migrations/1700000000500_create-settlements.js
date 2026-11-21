exports.up = (pgm) => {
    pgm.createTable('settlements', {
        id: { type: 'bigserial', primaryKey: true },
        group_id: { type: 'bigint', notNull: true, references: 'groups', onDelete: 'CASCADE' },
        from_user_id: { type: 'bigint', notNull: true, references: 'users' },
        to_user_id: { type: 'bigint', notNull: true, references: 'users' },
        amount_cents: { type: 'bigint', notNull: true, check: 'amount_cents > 0' },
        note: { type: 'text' },
        settled_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
        created_by: { type: 'bigint', notNull: true, references: 'users' },
        created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') }
    }, {
        constraints: { check: 'from_user_id <> to_user_id' }
    })
    pgm.createIndex('settlements', ['group_id', { name: 'settled_at', sort: 'DESC' }, { name: 'id', sort: 'DESC' }], { name: 'settlements_group_settled_idx' })
    pgm.createIndex('settlements', 'from_user_id')
    pgm.createIndex('settlements', 'to_user_id')
}

exports.down = (pgm) => {
    pgm.dropTable('settlements')
}
