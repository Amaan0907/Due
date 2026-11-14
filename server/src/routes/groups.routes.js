const {Router}=require('express')
const requireAuth=require('../middleware/auth')
const {requireMember,requireAdmin}=require('../middleware/requireMember.js')
const validators=require('../validators/groups.validators.js')
const controllers=require('../controllers/groups.controller.js')
const validate=require('../middleware/validate.js')
const router=Router()
router.use(requireAuth)

router.get('/',controllers.list)
router.post('/',validate({body:validators.createGroupSchema}),controllers.create)


router.get('/:id',requireMember,controllers.get)
router.patch('/:id',requireMember,requireAdmin,validate({body:validators.updateGroupSchema}),controllers.update)
router.delete('/:id',requireMember,requireAdmin,controllers.remove)


router.post('/:id/members',requireMember,validate({body:validators.addMemberSchema}),controllers.addMember)

router.delete("/:id/members/:userId",requireMember,validate({params:validators.memberParams}),controllers.removeMember)

module.exports=router