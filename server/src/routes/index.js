const {Router} =require('express')
const {create,findByEmail,findById,findByIdWithoutPassword,update}=require('../repositories/users.repo.js')
const {pool} =require('../config/db')

const router=Router()

router.get('/health',async (req,res)=>{
    try {
        await pool.query('SELECT 1')
        res.json({status:'ok',db:'ok'})
    } catch (error) {
        res.status(503).json({status:'error',db:'unreachable'})
    }
})
router.use('/auth',require('./auth.routes.js'))


module.exports=router