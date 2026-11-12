const {Router}=require('express')

const validate=require('../middleware/validate')
const requireAuth = require('../middleware/auth')
const {authLimiter}=require('../middleware/rateLimit.js')
const authValidators=require('../validators/auth.validators.js')
const controllers=require('../controllers/auth.controller.js')



const router=Router()



router.post('/register',authLimiter,validate({body:authValidators.registerSchema}),controllers.registerController)

router.post('/login',authLimiter,validate({body:authValidators.loginSchema}),controllers.loginController)

router.post('/logout',controllers.logoutController)

router.get('/me',requireAuth,controllers.currentUserController)

router.patch('/me',requireAuth,validate({body:authValidators.updateSchema}),controllers.updateUserController)

module.exports=router