const { withTransaction } = require('../config/db.js')
const groupsRepo = require('../repositories/groups.repo.js')
const membersRepo = require('../repositories/members.repo.js')
const usersRepo = require('../repositories/users.repo.js')
const activity = require('../repositories/activity.repo.js')
const balancesRepo = require('../repositories/balances.repo.js')
const { netBalances } = require('../lib/balances.js')

const { notFound, forbidden, conflict, AppError } = require('../lib/errors.js')

// myNetCents comes from the ledger: a group with no ledger rows for this user is 0
const withNet = (group, nets) => group && { ...group, myNetCents: nets.get(group.id) ?? 0 }

async function findGroup(groupId, userId) {
    const [group, nets] = await Promise.all([
        groupsRepo.findForUser(groupId, userId),
        balancesRepo.netForUser(userId, groupId)
    ])
    return withNet(group, nets)
}


async function create(user, { name, description, currency }) {

    const groupId = await withTransaction(async (db) => {

        const id = await groupsRepo.create({ name, description: description || null, currency, createdBy: user.id }, db)
        await membersRepo.add(id, user.id, 'admin', db)
        await activity.log({ groupId: id, actorId: user.id, action: 'group.created', entityType: 'group', entityId: id, payload: { name } }, db)
        return id
    })

    return findGroup(groupId, user.id)
}

async function list(userId) {
    const [groups, nets] = await Promise.all([
        groupsRepo.listForUser(userId),
        balancesRepo.netForUser(userId)
    ])
    return groups.map((g) => withNet(g, nets))
}

async function get(groupId, userId) {
    const [group, members] = await Promise.all([
        findGroup(groupId, userId),
        membersRepo.list(groupId)
    ])

    return { group, members }
}

async function update(user, groupId, data) {

    await withTransaction(async (db) => {
        await groupsRepo.update(groupId, data, db)
        await activity.log({ groupId: groupId, actorId: user.id, action: 'group.updated', entityType: 'group', entityId: groupId, payload: data }, db)
    })

    return findGroup(groupId, user.id)
}

// Decision D4: deleting a group with unpaid debts would wipe them out
async function remove(groupId) {
    const net = netBalances(await balancesRepo.ledgerEdges(groupId))
    if ([...net.values()].some((cents) => cents !== 0)) {
        throw conflict('BALANCE_NOT_ZERO', 'Settle all balances before deleting this group')
    }
    await groupsRepo.remove(groupId)
}

async function addMember(groupId, actor, email) {
    const target = await usersRepo.findByEmailWithoutPass(email)
    if (!target) {
        throw new AppError(404, 'USER_NOT_FOUND', 'No account with this email exist')
    }

    try {
        return await withTransaction(async (db) => {
            await membersRepo.add(groupId, target.id, 'member', db)
            await activity.log({ groupId: groupId, actorId: actor.id, action: 'member.added', entityType: 'member', entityId: target.id, payload: { userId: target.id, name: target.name } }, db)
            return membersRepo.find(groupId, target.id, db)
        })
    } catch (error) {
        if (error.code == '23505') {
            throw conflict('ALREADY_MEMBER', 'This user is already a member of this group')
        }
        throw error
    }
}

async function removeMember(actor, groupId, membership, targetId) {
    const isSelf = actor.id == targetId
    if (!isSelf && membership.role !== 'admin') {
        throw forbidden('Only admin or self can remove member from group')
    }

    await withTransaction(async (db) => {
        const target = await membersRepo.find(groupId, targetId, db)
        if (!target) throw notFound('Member')
        if (target.role == 'admin' && (await membersRepo.countAdmin(groupId, db) === 1)) {
            throw conflict('LAST_ADMIN', 'The only admin can not be removed')

        }
        // Decision D2: a member who owes or is owed must settle up first
        const nets = await balancesRepo.netForUser(targetId, groupId, db)
        if ((nets.get(groupId) ?? 0) !== 0) {
            throw conflict('BALANCE_NOT_ZERO', `${target.user.name} still has a balance in this group. Settle up first`)
        }

        await membersRepo.remove(groupId, targetId, db)
        await activity.log({ groupId: groupId, actorId: actor.id, action: 'member.removed', entityType: 'member', entityId: targetId, payload: { userId: targetId, name: target.user.name } }, db)


    })
}

module.exports = {
    create,
    list,
    get,
    remove,
    update,
    addMember,
    removeMember
}
