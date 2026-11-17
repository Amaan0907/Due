exports.up=(pgm)=>{
    pgm.createTable('expense_splits',{
        expense_id:{type:'bigint',notNull:true,references:'expenses',primaryKey:true,onDelete:'CASCADE'},
        user_id:{type:'bigint',notNull:true,references:'users',primarykey:true},
        share_cents:{type:'bigint',notNull:true,check:'share_cents>=0'},
        raw_value:{type:'numeric'}
    })

    pgm.createIndex('expense_splits','user_id')
}

exports.down=(pgm)=>{
    pgm.dropTable('expense_splits')
}


