const { netBalances, pairwiseDebts, simplifyDebts, suggestTransfers } = require('../../server/src/lib/balances.js');


const edge = (debtor, creditor, amountCents) => ({ debtor, creditor, amountCents });
const net = (edges) => Object.fromEntries(netBalances(edges));
const sum = (arr) => arr.reduce((a, b) => a + b, 0);


const PRD = [edge(2, 1, 10000), edge(3, 1, 10000), edge(3, 2, 7500)];

// Applies transfers to balances; returns what is left for each person.
function apply(netMap, transfers) {
    const left = new Map(netMap);
    for (const t of transfers) {
        left.set(t.from, left.get(t.from) + t.amountCents);
        left.set(t.to, left.get(t.to) - t.amountCents);
    }
    return left;
}

// Small seeded random generator, so a failing case can be reproduced.
function rng(seed) {
    return (n) => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return Math.floor((seed / 2147483648) * n);
    };
}

function randomLedger(rand) {
    const people = 2 + rand(7);
    const edges = [];
    for (let i = 0, n = 1 + rand(12); i < n; i++) {
        const a = 1 + rand(people);
        const b = 1 + rand(people);
        if (a !== b) edges.push(edge(a, b, 1 + rand(rand(2) ? 100 : 100000)));
    }
    return edges;
}

describe('netBalances', () => {
    test('PRD example: A +200, B -25, C -175', () => {
        expect(net(PRD)).toEqual({ 1: 20000, 2: -2500, 3: -17500 });
    });

    test('a settlement (written as the receiver owing the payer) cancels the debt', () => {
        // B pays A 25 -> edge "A owes B 25"
        expect(net([...PRD, edge(1, 2, 2500)])).toEqual({ 1: 17500, 2: 0, 3: -17500 });
    });

    test('paying more than owed flips the balance (decision D1)', () => {
        expect(net([...PRD, edge(1, 2, 5000)])).toEqual({ 1: 15000, 2: 2500, 3: -17500 });
    });

    test('empty ledger -> no balances', () => {
        expect(netBalances([]).size).toBe(0);
    });

    test('balances always add up to zero (500 random ledgers)', () => {
        const rand = rng(1);
        for (let i = 0; i < 500; i++) {
            expect(sum([...netBalances(randomLedger(rand)).values()])).toBe(0);
        }
    });
});

describe('pairwiseDebts', () => {
    test('PRD example: one entry per pair, biggest first, ties by lower from-id', () => {
        expect(pairwiseDebts(PRD)).toEqual([
            { from: 2, to: 1, amountCents: 10000 },
            { from: 3, to: 1, amountCents: 10000 },
            { from: 3, to: 2, amountCents: 7500 },
        ]);
    });

    test('debts in both directions are netted', () => {
        expect(pairwiseDebts([edge(1, 2, 500), edge(2, 1, 300)])).toEqual([{ from: 1, to: 2, amountCents: 200 }]);
        expect(pairwiseDebts([edge(1, 2, 300), edge(2, 1, 500)])).toEqual([{ from: 2, to: 1, amountCents: 200 }]);
    });

    test('debts that cancel exactly disappear', () => {
        expect(pairwiseDebts([edge(1, 2, 500), edge(2, 1, 500)])).toEqual([]);
    });

    test('repeated edges for the same pair are added up', () => {
        expect(pairwiseDebts([edge(1, 2, 100), edge(1, 2, 250)])).toEqual([{ from: 1, to: 2, amountCents: 350 }]);
    });

    test('self-debts and zero amounts are ignored', () => {
        expect(pairwiseDebts([edge(1, 1, 500), edge(1, 2, 0)])).toEqual([]);
    });

    test('pairwise debts give the same net balances as the ledger (500 random ledgers)', () => {
        const rand = rng(2);
        for (let i = 0; i < 500; i++) {
            const edges = randomLedger(rand);
            const fromPairs = pairwiseDebts(edges).map((p) => edge(p.from, p.to, p.amountCents));
            const expected = [...netBalances(edges)].filter(([, c]) => c !== 0);
            const actual = [...netBalances(fromPairs)].filter(([, c]) => c !== 0);
            expect(new Map(actual)).toEqual(new Map(expected));
        }
    });
});

describe('simplifyDebts', () => {
    test('PRD example: 3 pairwise debts become 2 payments', () => {
        expect(simplifyDebts(netBalances(PRD))).toEqual([
            { from: 3, to: 1, amountCents: 17500 },
            { from: 2, to: 1, amountCents: 2500 },
        ]);
    });

    test('a cycle of equal debts needs no payments', () => {
        const cycle = [edge(1, 2, 1000), edge(2, 3, 1000), edge(3, 1, 1000)];
        expect(simplifyDebts(netBalances(cycle))).toEqual([]);
    });

    test('a chain collapses: A owes B, B owes C -> A pays C directly', () => {
        expect(simplifyDebts(netBalances([edge(1, 2, 1000), edge(2, 3, 1000)]))).toEqual([
            { from: 1, to: 3, amountCents: 1000 },
        ]);
    });

    test('settled group (everyone at zero) -> no payments', () => {
        expect(simplifyDebts(new Map([[1, 0], [2, 0]]))).toEqual([]);
        expect(simplifyDebts(new Map())).toEqual([]);
    });

    test('ties go to the lowest user id', () => {
        const balances = new Map([[4, -100], [2, -100], [3, 100], [1, 100]]);
        expect(simplifyDebts(balances)).toEqual([
            { from: 2, to: 1, amountCents: 100 },
            { from: 4, to: 3, amountCents: 100 },
        ]);
    });

    test('same balances in a different order -> same payments', () => {
        const a = new Map([[1, 500], [2, -200], [3, -300], [4, 0]]);
        const b = new Map([[4, 0], [3, -300], [1, 500], [2, -200]]);
        expect(simplifyDebts(b)).toEqual(simplifyDebts(a));
    });

    test('rejects balances that do not add up to zero', () => {
        expect(() => simplifyDebts(new Map([[1, 100], [2, -99]]))).toThrow('do not add up to zero');
    });

    test('guarantees hold on 1000 random ledgers', () => {
        const rand = rng(3);
        for (let i = 0; i < 1000; i++) {
            const balances = netBalances(randomLedger(rand));
            const transfers = simplifyDebts(balances);
            const withBalance = [...balances.values()].filter((c) => c !== 0).length;

            // at most n - 1 payments for n people with a balance
            expect(transfers.length).toBeLessThanOrEqual(Math.max(withBalance - 1, 0));
            for (const t of transfers) {
                expect(Number.isInteger(t.amountCents)).toBe(true);
                expect(t.amountCents).toBeGreaterThan(0);
                // only people who owe pay, only people who are owed receive
                expect(balances.get(t.from)).toBeLessThan(0);
                expect(balances.get(t.to)).toBeGreaterThan(0);
            }
            // making every payment settles everyone, so nobody paid more than they owed
            for (const left of apply(balances, transfers).values()) expect(left).toBe(0);
        }
    });
});

describe('suggestTransfers', () => {
    test('uses greedy when it is shorter (PRD example)', () => {
        expect(suggestTransfers(netBalances(PRD), pairwiseDebts(PRD))).toEqual(simplifyDebts(netBalances(PRD)));
    });

    test('keeps the pairwise list when greedy would need more payments', () => {
        // A=1 owes B=2 5; C=3 owes D=4 4 and E=5 2
        const edges = [edge(1, 2, 5), edge(3, 4, 4), edge(3, 5, 2)];
        expect(simplifyDebts(netBalances(edges))).toHaveLength(4);
        expect(suggestTransfers(netBalances(edges), pairwiseDebts(edges))).toEqual(pairwiseDebts(edges));
    });

    test('never longer than pairwise or n - 1, and always settles everyone (1000 random ledgers)', () => {
        const rand = rng(4);
        for (let i = 0; i < 1000; i++) {
            const edges = randomLedger(rand);
            const balances = netBalances(edges);
            const pairwise = pairwiseDebts(edges);
            const transfers = suggestTransfers(balances, pairwise);
            const withBalance = [...balances.values()].filter((c) => c !== 0).length;

            expect(transfers.length).toBeLessThanOrEqual(pairwise.length);
            expect(transfers.length).toBeLessThanOrEqual(Math.max(withBalance - 1, 0));
            for (const left of apply(balances, transfers).values()) expect(left).toBe(0);
        }
    });
});
