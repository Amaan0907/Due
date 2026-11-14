const {pool}=require('../config/db.js')

async function log({groupId,actorId,action,entityType,entityId=null,payload={}},db=pool) {
    await db.query(
        `INSERT INTO activity_log(group_id,actor_id,action,entity_type,entity_id,payload)
        VALUES($1,$2,$3,$4,$5,$6)`,
        [groupId,actorId,action,entityType,entityId,JSON.stringify(payload)]
    )
}
module.exports={log}