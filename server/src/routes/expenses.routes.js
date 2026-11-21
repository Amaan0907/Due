const { Router } = require('express')
const requireAuth = require('../middleware/auth')
const { requireExpenseAccess, requireExpenseEditor } = require('../middleware/requireExpense.js')
const validate = require('../middleware/validate.js')
const validators = require('../validators/expense.validators.js')
const controllers = require('../controllers/expenses.controller.js')

const router = Router()
router.use(requireAuth)

router.get('/:id', requireExpenseAccess, controllers.get)
router.patch('/:id', requireExpenseAccess, requireExpenseEditor, validate({ body: validators.updateExpenseSchema }), controllers.update)
router.delete('/:id', requireExpenseAccess, requireExpenseEditor, controllers.remove)

module.exports = router


