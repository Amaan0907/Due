const expensesRepo = require('../repositories/expenses.repo.js')
const membersRepo = require('../repositories/members.repo.js')
const { badRequest, notFound, notAMember, forbidden } = require('../lib/errors.js')


async function requireExpenseAccess(req, res, next) {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id < 1) {
        throw badRequest('Invalid request')
    }

    const expense = await expensesRepo.findById(id)
    if (!expense) {
        throw notFound('Expense')
    }

    const member = await membersRepo.find(expense.groupId, req.user.id)
    if (!member) {
        throw notAMember()
    }

    req.expense = expense
    req.membership = { role: member.role }
    next()
}

async function requireExpenseEditor(req, res, next) {
    const allowed =
        req.membership.role === 'admin' ||
        req.expense.createdBy.id === req.user.id ||
        req.expense.paidBy.id === req.user.id

    if (!allowed) {
        throw forbidden('Only the creator, the payer or a group admin can change this expense')
    }
    next()
}

module.exports = { requireExpenseAccess, requireExpenseEditor }
