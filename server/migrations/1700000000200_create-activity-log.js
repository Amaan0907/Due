exports.up=(pgm)=>{
    pgm.createTable('activity_log',{
        id:{type:'bigserial',primaryKey:true},
        group_id:{type:'bigint',notNull:true,references:'groups',onDelete:'CASCADE'},
        actor_id:{type:'bigint',notNull:true,references:'users'},
        action:{type:'text',notNull:true},
        entity_type:{type:'text',notNull:true},
        entity_id:{type:'bigint'},
        payload:{type:'jsonb',notNull:true,default:'{}'},
        created_at:{type:'timestamptz',notNull:true,default:pgm.func('now()')}
    })
    pgm.createIndex('activity_log',['group_id',{name:'created_at',sort:'DESC'}])
}

exports.down=(pgm)=>{
    pgm.dropTable('activity_log')
}