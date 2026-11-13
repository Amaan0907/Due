const {pool}=require('../../server/src/config/db.js')

const resetDb=()=>pool.query('TRUNCATE users RESTART IDENTITY CASCADE')
const closeDb=()=>pool.end()


module.exports={resetDb,closeDb}