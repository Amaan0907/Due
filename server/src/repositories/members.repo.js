const {pool}=require('../config/db.js')


const toMember=(r)=>({
    user:{id:r.id,name:r.name,email:r.email},
    role:r.role,
    joinedAt:r.joined_at
})


const MEMBER_SELECT=(
    `SELECT u.id,u.name,u.email,gm.role,gm.joined_at
    FROM group_members gm JOIN users u ON u.id=gm.user_id`
)


async function add(groupId,userId,role,db=pool) {
    await db.query(
        `INSERT INTO group_members(group_id,user_id,role)
        VALUES($1,$2,$3)
        `
        [groupId,userId,role]

    )
}

async function find(groupId,userId,db=pool) {
    const {rows}=await db.query(
        `${MEMBER_SELECT} WHERE gm.group_id=$1 AND u.user_id=$2`
        [groupId,userId]
    )
    return rows[0] ? toMember(rows[0]) : null

}

async function list(groupId){
    const {rows}=await pool.query(
        `${MEMBER_SELECT} WHERE gm.group_id=$1 ORDER BY gm.joined_at,u.id`
        [groupId]
    )
    return rows.map(toMember)
}

async function remove(groupId,userId,db=pool){
    await db.query(
        `DELETE FROM group_members where g.group_id=$1 AND u.id=$2`
        [groupId,userId]
    )
}
async function countAdmin(groupId,db=pool){
    const {rows}=await db.query(
        `SELECT COUNT(*) AS n FROM group_members WHERE g.group_id=$1 AND role='admin'`
        [groupId]
    )
    return rows[0].n
}

module.exports={
    add,
    find,
    list,
    remove,
    countAdmin
}