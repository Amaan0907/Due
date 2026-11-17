const {
    splitEqual,
    splitExact,
    splitPercent,
    splitShares,
    computeSplit,
    sumShares,
} = require('../../server/src/lib/money.js');

const shares = (result) => result.map((r) => r.shareCents);
const sum = (arr) => arr.reduce((a, b) => a + b, 0);

// { 1: 5000, 2: 3000 } -> [{ userId: 1, value: 5000 }, { userId: 2, value: 3000 }]
const entries = (obj) => Object.entries(obj).map(([userId, value]) => ({ userId: Number(userId), value }));

// Every invalid input must throw our standard 400 error.
function expectRejected(fn) {
    try {
        fn();
    } catch (err) {
        expect(err.status).toBe(400);
        expect(err.code).toBe('VALIDATION_ERROR');
        return;
    }
    throw new Error('Expected the call to throw, but it did not');
}

describe('splitEqual', () => {
    test('₹100.00 among 3 people: the extra cent goes to the lowest user id', () => {
        const result = splitEqual(10000, [1, 2, 3]);
        expect(result).toEqual([
            { userId: 1, shareCents: 3334 },
            { userId: 2, shareCents: 3333 },
            { userId: 3, shareCents: 3333 },
        ]);
        expect(sum(shares(result))).toBe(10000);
    });

    test('the result does not depend on the order of the input', () => {
        expect(splitEqual(10000, [3, 1, 2])).toEqual(splitEqual(10000, [1, 2, 3]));
    });

    test('divides evenly when it can', () => {
        expect(shares(splitEqual(9000, [4, 5, 6]))).toEqual([3000, 3000, 3000]);
    });

    test('1 cent among 3 people: only the lowest id gets it', () => {
        expect(shares(splitEqual(1, [1, 2, 3]))).toEqual([1, 0, 0]);
    });

    test('2 extra cents go to the two lowest ids', () => {
        expect(shares(splitEqual(11, [1, 2, 3]))).toEqual([4, 4, 3]);
    });

    test('a single participant owes everything', () => {
        expect(splitEqual(777, [9])).toEqual([{ userId: 9, shareCents: 777 }]);
    });

    test('does not change the array it is given', () => {
        const ids = [3, 1, 2];
        splitEqual(100, ids);
        expect(ids).toEqual([3, 1, 2]);
    });

    test.each([
        ['zero total', 0, [1, 2]],
        ['negative total', -100, [1, 2]],
        ['fractional total', 10.5, [1, 2]],
        ['string total', '100', [1, 2]],
        ['no participants', 100, []],
        ['duplicate participant', 100, [1, 1]],
        ['non-integer user id', 100, [1, 2.5]],
        ['zero user id', 100, [0, 1]],
    ])('rejects %s', (_, total, ids) => {
        expectRejected(() => splitEqual(total, ids));
    });
});

describe('splitExact', () => {
    test('uses the amounts as given when they add up to the total', () => {
        const result = splitExact(300000, entries({ 1: 150000, 2: 100000, 3: 50000 }));
        expect(shares(result)).toEqual([150000, 100000, 50000]);
    });

    test('allows a participant who owes 0', () => {
        expect(shares(splitExact(100, entries({ 1: 100, 2: 0 })))).toEqual([100, 0]);
    });

    test('returns the shares ordered by user id', () => {
        const result = splitExact(100, [{ userId: 5, value: 40 }, { userId: 2, value: 60 }]);
        expect(result.map((r) => r.userId)).toEqual([2, 5]);
    });

    test.each([
        ['too low', { 1: 100, 2: 100 }, 300],
        ['too high', { 1: 200, 2: 200 }, 300],
    ])('rejects amounts that add up to %s', (_, values, total) => {
        expectRejected(() => splitExact(total, entries(values)));
    });

    test.each([
        ['negative amount', { 1: 400, 2: -100 }],
        ['fractional amount', { 1: 150.5, 2: 149.5 }],
        ['missing amount', { 1: 300, 2: undefined }],
    ])('rejects a %s', (_, values) => {
        expectRejected(() => splitExact(300, entries(values)));
    });

    test('rejects duplicate participants', () => {
        expectRejected(() => splitExact(100, [{ userId: 1, value: 50 }, { userId: 1, value: 50 }]));
    });
});

describe('splitPercent (values are basis points: 33.33% = 3333)', () => {
    test('largest remainder method: 999 cents at 50 / 30 / 20 %', () => {
        // exact: 499.5, 299.7, 199.8 -> floors 499, 299, 199 (sum 997); 2 left over go to .8 and .7
        expect(shares(splitPercent(999, entries({ 1: 5000, 2: 3000, 3: 2000 })))).toEqual([499, 300, 200]);
    });

    test('a clean split needs no remainder', () => {
        expect(shares(splitPercent(10000, entries({ 1: 3333, 2: 3333, 3: 3334 })))).toEqual([3333, 3333, 3334]);
    });

    test('ties go to the lowest user id', () => {
        expect(shares(splitPercent(1, entries({ 1: 5000, 2: 5000 })))).toEqual([1, 0]);
    });

    test('a 0% participant owes nothing', () => {
        expect(shares(splitPercent(500, entries({ 1: 10000, 2: 0 })))).toEqual([500, 0]);
    });

    test('the result does not depend on the order of the input', () => {
        const a = splitPercent(999, entries({ 1: 5000, 2: 3000, 3: 2000 }));
        const b = splitPercent(999, [...entries({ 1: 5000, 2: 3000, 3: 2000 })].reverse());
        expect(b).toEqual(a);
    });

    test.each([
        ['add up to 99.99%', { 1: 5000, 2: 4999 }],
        ['add up to 100.01%', { 1: 5000, 2: 5001 }],
        ['contain a negative value', { 1: 11000, 2: -1000 }],
        ['contain a fractional value', { 1: 5000.5, 2: 4999.5 }],
        ['contain a value above 100%', { 1: 10001, 2: -1 }],
    ])('rejects percentages that %s', (_, values) => {
        expectRejected(() => splitPercent(1000, entries(values)));
    });
});

describe('splitShares', () => {
    test('1000 cents with weights 2 / 1 / 1', () => {
        expect(shares(splitShares(1000, entries({ 1: 2, 2: 1, 3: 1 })))).toEqual([500, 250, 250]);
    });

    test('equal weights behave like an equal split', () => {
        expect(shares(splitShares(10000, entries({ 1: 1, 2: 1, 3: 1 })))).toEqual([3334, 3333, 3333]);
    });

    test('weights do not have to add up to anything in particular', () => {
        expect(sum(shares(splitShares(1001, entries({ 1: 3, 2: 7, 3: 11 }))))).toBe(1001);
    });

    test.each([
        ['zero weight', { 1: 0, 2: 1 }],
        ['negative weight', { 1: -1, 2: 2 }],
        ['fractional weight', { 1: 1.5, 2: 1 }],
        ['missing weight', { 1: undefined, 2: 1 }],
    ])('rejects a %s', (_, values) => {
        expectRejected(() => splitShares(100, entries(values)));
    });
});

describe('computeSplit', () => {
    test('equal: ignores any values and returns value = null', () => {
        const result = computeSplit('equal', 10000, [{ userId: 2, value: 99 }, { userId: 1 }, { userId: 3 }]);
        expect(result).toEqual([
            { userId: 1, shareCents: 3334, value: null },
            { userId: 2, shareCents: 3333, value: null },
            { userId: 3, shareCents: 3333, value: null },
        ]);
    });

    test('percent: echoes what the user entered in value (stored as raw_value)', () => {
        const result = computeSplit('percent', 999, entries({ 1: 5000, 2: 3000, 3: 2000 }));
        expect(result).toEqual([
            { userId: 1, shareCents: 499, value: 5000 },
            { userId: 2, shareCents: 300, value: 3000 },
            { userId: 3, shareCents: 200, value: 2000 },
        ]);
    });

    test('exact and shares route to the right function', () => {
        expect(shares(computeSplit('exact', 100, entries({ 1: 70, 2: 30 })))).toEqual([70, 30]);
        expect(shares(computeSplit('shares', 100, entries({ 1: 3, 2: 1 })))).toEqual([75, 25]);
    });

    test('rejects an unknown split type', () => {
        expectRejected(() => computeSplit('random', 100, entries({ 1: 1 })));
    });

    test('rejects missing entries', () => {
        expectRejected(() => computeSplit('equal', 100, undefined));
    });
});

describe('sumShares', () => {
    test('adds up the shares', () => {
        expect(sumShares([{ shareCents: 3334 }, { shareCents: 3333 }, { shareCents: 3333 }])).toBe(10000);
    });
});

// A small seeded random generator, so a failure can be reproduced exactly.
function mulberry32(seed) {
    let a = seed;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe('property tests: 1,000 random splits per type', () => {
    const rand = mulberry32(2026);
    const int = (min, max) => min + Math.floor(rand() * (max - min + 1));

    const shuffle = (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = int(0, i);
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };

    const userIds = (n) => {
        const ids = new Set();
        while (ids.size < n) ids.add(int(1, 500));
        return [...ids];
    };

    // n weights that add up to exactly 10000
    const percentWeights = (n) => {
        const cuts = Array.from({ length: n - 1 }, () => int(0, 10000)).sort((a, b) => a - b);
        const weights = [];
        let prev = 0;
        for (const cut of [...cuts, 10000]) {
            weights.push(cut - prev);
            prev = cut;
        }
        return weights;
    };

    test('equal: shares add up to the total, differ by at most 1 cent, ignore input order', () => {
        for (let i = 0; i < 1000; i++) {
            const total = int(1, 1_000_000_000);
            const ids = userIds(int(1, 12));
            const result = shares(splitEqual(total, ids));
            expect(sum(result)).toBe(total);
            expect(Math.max(...result) - Math.min(...result)).toBeLessThanOrEqual(1);
            expect(splitEqual(total, shuffle(ids))).toEqual(splitEqual(total, ids));
        }
    });

    test.each([
        ['percent', (n) => percentWeights(n)],
        ['shares', (n) => Array.from({ length: n }, () => int(1, 20))],
    ])('%s: shares add up to the total, stay within 1 cent of exact, ignore input order', (type, makeWeights) => {
        for (let i = 0; i < 1000; i++) {
            const total = int(1, 1_000_000_000);
            const ids = userIds(int(1, 12));
            const weights = makeWeights(ids.length);
            const input = ids.map((userId, k) => ({ userId, value: weights[k] }));

            const result = computeSplit(type, total, input);
            expect(sum(shares(result))).toBe(total);

            const totalWeight = sum(weights);
            const weightOf = new Map(input.map((e) => [e.userId, e.value]));
            for (const { userId, shareCents } of result) {
                expect(shareCents).toBeGreaterThanOrEqual(0);
                expect(Math.abs(shareCents - (total * weightOf.get(userId)) / totalWeight)).toBeLessThan(1);
            }

            expect(computeSplit(type, total, shuffle(input))).toEqual(result);
        }
    });
});
