const {pool}=require('../config/db.js')



const GROUP_SELECT=`
    SELECT g.id,g.name,g.description,g.currency,g.created_at,
        u.id AS creator_id,u.name AS creator_name,
        (SELECT COUNT(*) FROM group_members m WHERE m.group_id=g.id) AS member_count,
        gm.role AS my_role
    FROM groups g
    JOIN users u ON u.id=g.created_by
    JOIN group_members gm ON gm.group_id=g.id AND gm.user_id=$1
    `

const toGroup=(r)=>({
    id:r.id,
    name:r.name,
    description:r.description,
    currency:r.currency,
    createdBy:{id:r.creator_id,name:r.creator_name},
    createdAt:r.created_at,
    memberCount:r.member_count,
    myRole:r.my_role,
    myNetCents:0
})

//create group 
async function create({name,description,currency,createdBy},db=pool) {
    const {rows}=await db.query(
        `INSERT INTO groups(name,description,currency,created_by)
        VALUES($1,$2,$3,$4)
        RETURNING id`,
        [name,description,currency,createdBy]
    )

    return rows[0].id
}

//returns a particular group in which particular user exist
async function findForUser(groupId,userId) {
    const {rows}=await pool.query(
        `${GROUP_SELECT} WHERE g.id=$2
        `,
        [userId,groupId]
    )
    return rows[0]?toGroup(rows[0]):null
}

async function listForUser(userId){
    const {rows}=await pool.query(
        `${GROUP_SELECT} ORDER BY COALESCE((
        SELECT MAX(a.created_at) FROM activity_log a 
        WHERE a.group_id=g.id),
        g.created_at) DESC`,
        [userId]
    )
    return rows.map(toGroup)
}

async function findAccess(groupId,userId){
    const {rows}=await pool.query(
        `SELECT g.id,g.currency,gm.role
        FROM groups g
        LEFT JOIN group_members gm ON gm.group_id=g.id AND gm.user_id=$2
        WHERE g.id=$1`,
        [groupId,userId]
    )
    return rows[0]??null
}

async function update(id,{name,description},db=pool){
    await db.query(
        `UPDATE groups
            SET name=COALESCE($2,name),
                description=CASE WHEN $3::boolean THEN $4 ELSE description END
        WHERE id=$1

        `,
        [id,name??null,description!==undefined,description||null]
    )
}

async function remove(id,db=pool) {
    await db.query(
        `DELETE FROM groups WHERE id=$1`,
        [id]
    )
}

module.exports={
    create,
    findForUser,
    listForUser,
    findAccess,
    update,
    remove

}


