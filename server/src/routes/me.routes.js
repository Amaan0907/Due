const { Router } = require('express')
const requireAuth = require('../middleware/auth')
const balanceControllers = require('../controllers/balances.controller.js')

const router = Router()
router.use(requireAuth)

router.get('/summary', balanceControllers.summary)

module.exports = router
