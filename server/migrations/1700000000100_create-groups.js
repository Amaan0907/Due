const { tr } = require("zod/v4/locales")

exports.up=(pgm)=>{
    pgm.createTable('groups',{
        id:{type:'bigserial',primaryKey:true},
        name:{type:'text',notNull:true},
        description:{type:'text'},
        currency:{type:'char(3)',notNull:true,default:'INR'},
        created_by:{type:'bigint',notNull:true,references:'users'},
        created_at:{type:'timestamptz',notNull:true,default:pgm.func('now()')}

    })



    pgm.createTable('group_members',{
        group_id:{type:'bigint',primaryKey:true,notNull:true,references:'groups',onDelete:'CASCADE'},
        user_id:{type:'bigint',primaryKey:true,notNull:true,references:'users'},
        role:{type:'text',notNull:true,check:"role IN('admin','member')"},
        joined_at:{type:'timestamptz',notNull:true,default:pgm.func('now()')}
    })
    pgm.createIndex('group_members','user_id')
}

exports.down=(pgm)=>{
    pgm.dropTable('group_members')
    pgm.dropTable('groups')
}