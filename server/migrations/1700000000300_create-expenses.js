exports.up=(pgm)=>{
    pgm.createTable('expenses',{
        id:{type:'bigserial',primaryKey:true},
        group_id:{type:'bigint',notNull:true,references:'groups',onDelete:'CASCADE'},
        description:{type:'text',notNull:true},
        amount_cents:{type:'bigint',notNull:true,check:'amount_cents > 0'},
        paid_by:{type:'bigint',notNull:true,references:'users'},
        split_type:{type:'text',notNull:true,check:"split_type IN ('equal','exact','percent','shares')"},
        category:{type:'text',check:"category IN ('food','transport','stay','groceries','utilities','entertainment','shopping','other')"},
        expense_date:{type:'date',notNull:true,default:pgm.func('CURRENT_DATE')},
        created_by:{type:'bigint',notNull:true,references:'users'},
        created_at:{type:'timestamptz',notNull:true,default:pgm.func('now()')},
        updated_at:{type:'timestamptz',notNull:true,default:pgm.func('now()')},
        deleted_at:{type:'timestamptz'}
    })
    pgm.createIndex('expenses', ['group_id', { name: 'expense_date', sort: 'DESC' }, { name: 'id', sort: 'DESC' }], { name: 'expenses_group_date_idx' })
    pgm.createIndex('expenses','paid_by')
}

exports.down=(pgm)=>{
    pgm.dropTable('expenses')
}