const {pool}=require('../config/db.js')

const toUser=(r)=>({
    id:r.id,
    name:r.name,
    email:r.email,
    createdAt:r.created_at
})

const PUBLIC='id,name,email,created_at'

async function create({name,email,passwordHash}) {
    const {rows}=await pool.query(
        `INSERT INTO users (name,email,password_hash)
        VALUES ($1,$2,$3)
        RETURNING ${PUBLIC}`,
        [name,email,passwordHash]
    )

    return toUser(rows[0])
}

async function findByEmail(email) {
    const {rows}=await pool.query(
        `SELECT * FROM users
        WHERE email = $1`,
        [email]
    )

    return rows[0]?{... toUser(rows[0]),passwordHash:rows[0].password_hash}:null
}
async function findById(id) {
    const {rows}=await pool.query(
        `SELECT * FROM users
        WHERE ID =$1`,
        [id]
    )

    return rows[0]?{...toUser(rows[0]),passwordHash:rows[0].password_hash}:null
}

async function findByIdWithoutPassword(id) {
    const {rows}=await pool.query(
        `SELECT ${PUBLIC}  FROM users
        WHERE ID = $1`,
        [id]
    )

    return rows[0]?{...toUser(rows[0])}:null
}

async function update(id,{name,passwordHash}) {
    const {rows}=await pool.query(
        `UPDATE users SET
        name=COALESCE($2,name),
        password_hash=COALESCE($3,password_hash)
        WHERE ID=$1
        RETURNING ${PUBLIC}`,
        [id,name??null,passwordHash??null]
    )

    return rows[0]?{...toUser(rows[0])}:null
}
async function findByEmail(email){
    const {rows}=await pool.query(
        `SELECT ${PUBLIC} FROM users WHERE email=$1`
        [email]
    )
    return rows[0]?toUser(rows[0]):null
}


module.exports={
    create,
    findByEmail,
    findById,
    findByIdWithoutPassword,
    update,
    findByEmail
}