const balancesRepo = require('../repositories/balances.repo.js')
const groupsRepo = require('../repositories/groups.repo.js')
const { netBalances, pairwiseDebts, suggestTransfers } = require('../lib/balances.js')

// Reads the ledger once and works out everything the two group endpoints need.
async function load(groupId) {
    const edges = await balancesRepo.ledgerEdges(groupId)
    const net = netBalances(edges)
    const pairwise = pairwiseDebts(edges)
    const people = await balancesRepo.people(groupId, [...net.keys()])
    const named = (t) => ({ from: people.get(t.from).user, to: people.get(t.to).user, amountCents: t.amountCents })
    return { net, pairwise, people, named }
}

// Every current member (even at 0) plus former members who still have a balance.
async function balances(group) {
    const { net, pairwise, people, named } = await load(group.id)

    const members = [...people.values()]
        .map((p) => ({ user: p.user, netCents: net.get(p.user.id) ?? 0, isMember: p.isMember }))
        .filter((m) => m.isMember || m.netCents !== 0)
        .sort((a, b) => b.netCents - a.netCents || a.user.id - b.user.id)
        .map(({ user, netCents }) => ({ user, netCents }))

    return { currency: group.currency, members, pairwise: pairwise.map(named) }
}

async function simplify(group) {
    const { net, pairwise, named } = await load(group.id)
    const transfers = suggestTransfers(net, pairwise)

    return {
        currency: group.currency,
        transfers: transfers.map(named),
        pairwiseCount: pairwise.length,
        simplifiedCount: transfers.length
    }
}

// Dashboard header: totals per currency (rupees and dollars can't be added), plus groups not settled.
async function summary(userId) {
    const [groups, nets] = await Promise.all([groupsRepo.listForUser(userId), balancesRepo.netForUser(userId)])

    const totals = new Map()
    const unsettled = []
    for (const g of groups) {
        const netCents = nets.get(g.id) ?? 0
        if (netCents === 0) continue

        unsettled.push({ groupId: g.id, name: g.name, currency: g.currency, netCents })
        const t = totals.get(g.currency) ?? { currency: g.currency, owedToYouCents: 0, youOweCents: 0, netCents: 0 }
        if (netCents > 0) t.owedToYouCents += netCents
        else t.youOweCents += -netCents
        t.netCents += netCents
        totals.set(g.currency, t)
    }

    return {
        totals: [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
        groups: unsettled
    }
}

module.exports = { balances, simplify, summary }
