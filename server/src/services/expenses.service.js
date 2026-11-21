const { withTransaction } = require('../config/db.js')
const expensesRepo = require('../repositories/expenses.repo.js')
const membersRepo = require('../repositories/members.repo.js')
const activity = require('../repositories/activity.repo.js')
const { computeSplit, sumShares } = require('../lib/money.js')
const { todayUtc } = require('../lib/dates.js')
const cursorLib = require('../lib/cursor.js')
const { badRequest, notFound } = require('../lib/errors.js')


async function assertMembers(groupId, { payerId, splits = [] }) {
    const ids = [...splits.map((s) => s.userId)]
    if (payerId !== undefined) ids.push(payerId)
    const members = await membersRepo.filterMembers(groupId, ids)

    if (payerId !== undefined && !members.has(payerId)) {
        throw badRequest('Payer is not a member of this group', [{ path: 'paidBy', message: 'Not a member of this group' }])
    }
    splits.forEach((s, i) => {
        if (!members.has(s.userId)) {
            throw badRequest('Split includes someone who is not a member of this group',
                [{ path: `splits.${i}.userId`, message: 'Not a member of this group' }])
        }
    })
}

function assertSplitsAddUp(shares, amountCents) {
    if (sumShares(shares) !== amountCents) {
        throw new Error(`Split invariant broken: ${sumShares(shares)} !== ${amountCents}`)
    }
}

async function create(groupId, user, body) {
    const { description, amountCents, paidBy, splitType, splits } = body
    const category = body.category ?? null
    const expenseDate = body.expenseDate ?? todayUtc()

    const shares = computeSplit(splitType, amountCents, splits)
    await assertMembers(groupId, { payerId: paidBy, splits })
    assertSplitsAddUp(shares, amountCents)

    const id = await withTransaction(async (db) => {
        const expenseId = await expensesRepo.insert(
            { groupId, description, amountCents, paidBy, splitType, category, expenseDate, createdBy: user.id }, db
        )
        await expensesRepo.insertSplits(expenseId, shares, db)
        await activity.log({
            groupId, actorId: user.id, action: 'expense.created', entityType: 'expense', entityId: expenseId,
            payload: { description, amountCents }
        }, db)
        return expenseId
    })

    return expensesRepo.findById(id)
}

async function list(groupId, query) {
    const { limit, cursor, ...filters } = query
    const rows = await expensesRepo.list({
        groupId, limit, cursor: cursor ? cursorLib.decode(cursor) : null, ...filters
    })

    const items = rows.slice(0, limit)
    const last = items[items.length - 1]
    const nextCursor = rows.length > limit ? cursorLib.encode({ d: last.expenseDate, i: last.id }) : null
    return { items, nextCursor }
}

async function update(expense, user, body) {
    const next = {
        description: body.description ?? expense.description,
        paidBy: body.paidBy ?? expense.paidBy.id,
        category: body.category === undefined ? expense.category : body.category,
        expenseDate: body.expenseDate ?? expense.expenseDate,
        amountCents: expense.amountCents,
        splitType: expense.splitType
    }

    let shares = null
    if (body.splits) {
        next.amountCents = body.amountCents
        next.splitType = body.splitType
        shares = computeSplit(next.splitType, next.amountCents, body.splits)
        assertSplitsAddUp(shares, next.amountCents)
    }

    await assertMembers(expense.groupId, {
        payerId: body.paidBy,
        splits: body.splits
    })

    await withTransaction(async (db) => {
        if (!(await expensesRepo.update(expense.id, next, db))) throw notFound('Expense')
        if (shares) {
            await expensesRepo.deleteSplits(expense.id, db)
            await expensesRepo.insertSplits(expense.id, shares, db)
        }
        await activity.log({
            groupId: expense.groupId, actorId: user.id, action: 'expense.updated', entityType: 'expense', entityId: expense.id,
            payload: {
                description: next.description,
                amountCents: next.amountCents,
                previousAmountCents: expense.amountCents
            }
        }, db)
    })

    return expensesRepo.findById(expense.id)
}

async function remove(expense, user) {
    await withTransaction(async (db) => {
        if (!(await expensesRepo.softDelete(expense.id, db))) throw notFound('Expense')
        await activity.log({
            groupId: expense.groupId, actorId: user.id, action: 'expense.deleted', entityType: 'expense', entityId: expense.id,
            payload: { description: expense.description, amountCents: expense.amountCents }
        }, db)
    })
}

module.exports = { create, list, update, remove }
