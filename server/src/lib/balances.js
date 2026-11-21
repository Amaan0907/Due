// Pure balance maths: no database, so every rule here is unit-tested directly.
// Input is the ledger as "edges": { debtor, creditor, amountCents } means debtor owes creditor.

// Net balance per user: + means the user is owed money, - means the user owes.
function netBalances(edges) {
    const net = new Map()
    const add = (id, cents) => net.set(id, (net.get(id) ?? 0) + cents)
    for (const { debtor, creditor, amountCents } of edges) {
        add(creditor, amountCents)
        add(debtor, -amountCents)
    }
    return net
}

const byAmountDesc = (a, b) => b.amountCents - a.amountCents || a.from - b.from || a.to - b.to

// Who owes whom, one entry per pair: A->B and B->A are netted against each other.
function pairwiseDebts(edges) {
    const pairs = new Map()
    for (const { debtor, creditor, amountCents } of edges) {
        if (debtor === creditor) continue
        const [lo, hi] = debtor < creditor ? [debtor, creditor] : [creditor, debtor]
        const key = `${lo}:${hi}`
        // positive total = lo owes hi, negative = hi owes lo
        pairs.set(key, (pairs.get(key) ?? 0) + (debtor === lo ? amountCents : -amountCents))
    }

    const out = []
    for (const [key, cents] of pairs) {
        if (cents === 0) continue
        const [lo, hi] = key.split(':').map(Number)
        out.push(cents > 0 ? { from: lo, to: hi, amountCents: cents } : { from: hi, to: lo, amountCents: -cents })
    }
    return out.sort(byAmountDesc)
}

// Greedy min-cash-flow: the biggest debtor pays the biggest creditor, repeat.
// Ties go to the lowest user id, so the same balances always give the same transfers.
// Every step clears at least one person, so n people with a balance need at most n - 1 transfers.
function simplifyDebts(net) {
    let total = 0
    let debtors = []
    let creditors = []
    for (const [id, cents] of net) {
        total += cents
        if (cents < 0) debtors.push({ id, left: -cents })
        if (cents > 0) creditors.push({ id, left: cents })
    }
    if (total !== 0) throw new Error(`Balances do not add up to zero (off by ${total})`)

    const largest = (list) =>
        list.reduce((best, x) => (x.left > best.left || (x.left === best.left && x.id < best.id) ? x : best))

    const transfers = []
    while (debtors.length > 0) {
        const from = largest(debtors)
        const to = largest(creditors)
        const amountCents = Math.min(from.left, to.left)
        transfers.push({ from: from.id, to: to.id, amountCents })
        from.left -= amountCents
        to.left -= amountCents
        debtors = debtors.filter((d) => d.left > 0)
        creditors = creditors.filter((c) => c.left > 0)
    }
    return transfers
}

// Greedy is usually shorter than the raw pairwise list, but not always
// (A owes B 5, C owes D 4, C owes E 2: pairwise is 3 payments, greedy finds 4).
// Both lists settle the whole group, so suggest whichever is shorter.
function suggestTransfers(net, pairwise) {
    const greedy = simplifyDebts(net)
    return greedy.length <= pairwise.length ? greedy : pairwise
}

module.exports = { netBalances, pairwiseDebts, simplifyDebts, suggestTransfers }
