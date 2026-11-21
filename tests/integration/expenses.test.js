const request = require('supertest');
const app = require('../../server/src/app.js');
const expensesRepo = require('../../server/src/repositories/expenses.repo.js');
const { pool, resetDb, closeDb } = require('../helpers/db.js');
const { signUp } = require('../helpers/auth.js');

beforeEach(resetDb);
afterAll(closeDb);
afterEach(() => jest.restoreAllMocks());


async function setup() {
    const aisha = await signUp('Aisha');
    const rahul = await signUp('Rahul');
    const meera = await signUp('Meera');
    const dev = await signUp('Dev');
    const res = await aisha.agent.post('/api/groups').send({ name: 'Goa Trip' });
    const group = res.body.group;
    for (const who of [rahul, meera]) {
        await aisha.agent.post(`/api/groups/${group.id}/members`).send({ email: who.user.email });
    }
    return { aisha, rahul, meera, dev, group };
}

const sum = (arr) => arr.reduce((a, b) => a + b, 0);
const shares = (expense) => expense.splits.map((s) => s.shareCents);


const dinner = (ctx, overrides = {}) => ({
    description: 'Dinner at Thalassa',
    amountCents: 300000,
    paidBy: ctx.aisha.user.id,
    splitType: 'equal',
    category: 'food',
    expenseDate: '2026-11-02',
    splits: [{ userId: ctx.aisha.user.id }, { userId: ctx.rahul.user.id }, { userId: ctx.meera.user.id }],
    ...overrides,
});

const create = (who, groupId, body) => who.agent.post(`/api/groups/${groupId}/expenses`).send(body);

async function createOk(who, groupId, body) {
    const res = await create(who, groupId, body);
    expect(res.status).toBe(201);
    return res.body.expense;
}

describe('POST /api/groups/:id/expenses', () => {
    test('equal split: 201 with the full expense shape', async () => {
        const ctx = await setup();
        const res = await create(ctx.aisha, ctx.group.id, dinner(ctx));

        expect(res.status).toBe(201);
        expect(res.body.expense).toMatchObject({
            groupId: ctx.group.id,
            description: 'Dinner at Thalassa',
            amountCents: 300000,
            paidBy: { id: ctx.aisha.user.id, name: 'Aisha' },
            splitType: 'equal',
            category: 'food',
            expenseDate: '2026-11-02',
            createdBy: { id: ctx.aisha.user.id, name: 'Aisha' },
        });
        expect(res.body.expense.splits).toEqual([
            { user: { id: ctx.aisha.user.id, name: 'Aisha' }, value: null, shareCents: 100000 },
            { user: { id: ctx.rahul.user.id, name: 'Rahul' }, value: null, shareCents: 100000 },
            { user: { id: ctx.meera.user.id, name: 'Meera' }, value: null, shareCents: 100000 },
        ]);
    });

    test('equal split of an amount that does not divide: the extra cent goes to the lowest id', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, { amountCents: 10000 }));
        expect(shares(expense)).toEqual([3334, 3333, 3333]);
        expect(sum(shares(expense))).toBe(10000);
    });

    test('exact split keeps the amounts and echoes them in value', async () => {
        const ctx = await setup();
        const [a, r, m] = [ctx.aisha, ctx.rahul, ctx.meera].map((w) => w.user.id);
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, {
            splitType: 'exact',
            splits: [{ userId: a, value: 150000 }, { userId: r, value: 100000 }, { userId: m, value: 50000 }],
        }));
        expect(shares(expense)).toEqual([150000, 100000, 50000]);
        expect(expense.splits.map((s) => s.value)).toEqual([150000, 100000, 50000]);
    });

    test('percent split uses the largest remainder method; value is the basis points entered', async () => {
        const ctx = await setup();
        const [a, r, m] = [ctx.aisha, ctx.rahul, ctx.meera].map((w) => w.user.id);
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, {
            amountCents: 999,
            splitType: 'percent',
            splits: [{ userId: a, value: 5000 }, { userId: r, value: 3000 }, { userId: m, value: 2000 }],
        }));
        expect(shares(expense)).toEqual([499, 300, 200]);
        expect(expense.splits.map((s) => s.value)).toEqual([5000, 3000, 2000]);
    });

    test('shares split is proportional', async () => {
        const ctx = await setup();
        const [a, r, m] = [ctx.aisha, ctx.rahul, ctx.meera].map((w) => w.user.id);
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, {
            amountCents: 1000,
            splitType: 'shares',
            splits: [{ userId: a, value: 2 }, { userId: r, value: 1 }, { userId: m, value: 1 }],
        }));
        expect(shares(expense)).toEqual([500, 250, 250]);
    });

    test('the payer does not have to be in the split, and does not have to be the caller', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, {
            paidBy: ctx.rahul.user.id,
            splits: [{ userId: ctx.aisha.user.id }, { userId: ctx.meera.user.id }],
        }));
        expect(expense.paidBy.id).toBe(ctx.rahul.user.id);
        expect(expense.createdBy.id).toBe(ctx.aisha.user.id);
        expect(expense.splits).toHaveLength(2);
    });

    test('category and expenseDate are optional: category is null, the date defaults to today (UTC)', async () => {
        const ctx = await setup();
        const body = dinner(ctx);
        delete body.category;
        delete body.expenseDate;
        const expense = await createOk(ctx.aisha, ctx.group.id, body);
        expect(expense.category).toBeNull();
        expect(expense.expenseDate).toBe(new Date().toISOString().slice(0, 10));
    });

    test('stores the splits so that they add up to the amount (checked in the database)', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, { amountCents: 10001 }));
        const { rows } = await pool.query(
            'SELECT SUM(share_cents)::bigint AS total FROM expense_splits WHERE expense_id = $1', [expense.id]);
        expect(rows[0].total).toBe(10001);
    });

    test('writes an expense.created activity row', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        const { rows } = await pool.query(
            `SELECT actor_id, entity_type, entity_id, payload FROM activity_log WHERE action = 'expense.created'`);
        expect(rows).toEqual([{
            actor_id: ctx.aisha.user.id,
            entity_type: 'expense',
            entity_id: expense.id,
            payload: { description: 'Dinner at Thalassa', amountCents: 300000 },
        }]);
    });

    test.each([
        ['exact values that do not add up', (c) => ({ splitType: 'exact', splits: [{ userId: c.aisha.user.id, value: 1 }, { userId: c.rahul.user.id, value: 1 }] })],
        ['percentages that do not add up to 100%', (c) => ({ splitType: 'percent', splits: [{ userId: c.aisha.user.id, value: 5000 }, { userId: c.rahul.user.id, value: 4000 }] })],
        ['a missing value for a shares split', (c) => ({ splitType: 'shares', splits: [{ userId: c.aisha.user.id }, { userId: c.rahul.user.id }] })],
        ['a duplicate participant', (c) => ({ splits: [{ userId: c.aisha.user.id }, { userId: c.aisha.user.id }] })],
        ['no participants', () => ({ splits: [] })],
        ['more than 50 participants', () => ({ splits: Array.from({ length: 51 }, (_, i) => ({ userId: i + 1 })) })],
        ['an amount of 0', () => ({ amountCents: 0 })],
        ['a negative amount', () => ({ amountCents: -5 })],
        ['a fractional amount', () => ({ amountCents: 10.5 })],
        ['an amount above 1,000,000,000', () => ({ amountCents: 1_000_000_001 })],
        ['an amount sent as a string', () => ({ amountCents: '3000' })],
        ['an empty description', () => ({ description: '   ' })],
        ['a description over 100 characters', () => ({ description: 'x'.repeat(101) })],
        ['an unknown category', () => ({ category: 'gambling' })],
        ['an unknown split type', () => ({ splitType: 'random' })],
        ['a date in the future', () => ({ expenseDate: '2999-01-01' })],
        ['a date that does not exist', () => ({ expenseDate: '2026-02-30' })],
        ['a date in the wrong format', () => ({ expenseDate: '02/11/2026' })],
        ['an unknown field', () => ({ currency: 'USD' })],
    ])('400 for %s', async (_, make) => {
        const ctx = await setup();
        const res = await create(ctx.aisha, ctx.group.id, dinner(ctx, make(ctx)));
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        const { rows } = await pool.query('SELECT COUNT(*) AS n FROM expenses');
        expect(rows[0].n).toBe(0);
    });

    test('400 when the payer is not a member; details point at paidBy', async () => {
        const ctx = await setup();
        const res = await create(ctx.aisha, ctx.group.id, dinner(ctx, { paidBy: ctx.dev.user.id }));
        expect(res.status).toBe(400);
        expect(res.body.error.details[0].path).toBe('paidBy');
    });

    test('400 when someone in the split is not a member; details point at that entry', async () => {
        const ctx = await setup();
        const res = await create(ctx.aisha, ctx.group.id, dinner(ctx, {
            splits: [{ userId: ctx.aisha.user.id }, { userId: ctx.dev.user.id }],
        }));
        expect(res.status).toBe(400);
        expect(res.body.error.details[0].path).toBe('splits.1.userId');
    });

    test('is atomic: if saving the splits fails, no expense is left behind', async () => {
        const ctx = await setup();
        jest.spyOn(expensesRepo, 'insertSplits').mockRejectedValueOnce(new Error('boom'));

        const res = await create(ctx.aisha, ctx.group.id, dinner(ctx));
        expect(res.status).toBe(500);

        const expenses = await pool.query('SELECT COUNT(*) AS n FROM expenses');
        const activity = await pool.query(`SELECT COUNT(*) AS n FROM activity_log WHERE action = 'expense.created'`);
        expect(expenses.rows[0].n).toBe(0);
        expect(activity.rows[0].n).toBe(0);
    });

    test('403 NOT_A_MEMBER for someone outside the group', async () => {
        const ctx = await setup();
        const res = await create(ctx.dev, ctx.group.id, dinner(ctx));
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('NOT_A_MEMBER');
    });

    test('404 for a group that does not exist', async () => {
        const ctx = await setup();
        const res = await create(ctx.aisha, 9999, dinner(ctx));
        expect(res.status).toBe(404);
    });

    test('401 when not logged in', async () => {
        const ctx = await setup();
        const res = await request(app).post(`/api/groups/${ctx.group.id}/expenses`).send(dinner(ctx));
        expect(res.status).toBe(401);
    });
});

describe('GET /api/groups/:id/expenses', () => {
    const list = (who, groupId, query = '') => who.agent.get(`/api/groups/${groupId}/expenses${query}`);

    test('newest expenseDate first, then highest id', async () => {
        const ctx = await setup();
        const old = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, { description: 'old', expenseDate: '2026-10-01' }));
        const newA = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, { description: 'new A', expenseDate: '2026-11-01' }));
        const newB = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, { description: 'new B', expenseDate: '2026-11-01' }));

        const res = await list(ctx.rahul, ctx.group.id);
        expect(res.status).toBe(200);
        expect(res.body.items.map((e) => e.id)).toEqual([newB.id, newA.id, old.id]);
        expect(res.body.nextCursor).toBeNull();
    });

    test('an empty group returns no items', async () => {
        const ctx = await setup();
        const res = await list(ctx.aisha, ctx.group.id);
        expect(res.body).toEqual({ items: [], nextCursor: null });
    });

    test('cursor pagination walks through every expense once, in order', async () => {
        const ctx = await setup();
        const dates = ['2026-11-01', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-03'];
        for (const [i, d] of dates.entries()) {
            await createOk(ctx.aisha, ctx.group.id, dinner(ctx, { description: `e${i}`, expenseDate: d }));
        }

        const seen = [];
        let cursor = null;
        let pages = 0;
        do {
            const res = await list(ctx.aisha, ctx.group.id, `?limit=2${cursor ? `&cursor=${cursor}` : ''}`);
            expect(res.status).toBe(200);
            expect(res.body.items.length).toBeLessThanOrEqual(2);
            seen.push(...res.body.items.map((e) => e.description));
            cursor = res.body.nextCursor;
            pages += 1;
        } while (cursor);

        expect(pages).toBe(3);
        expect(seen).toEqual(['e4', 'e3', 'e2', 'e1', 'e0']);
    });

    test('filters: category, paidBy, involving, date range and text search', async () => {
        const ctx = await setup();
        const [a, r, m] = [ctx.aisha, ctx.rahul, ctx.meera].map((w) => w.user.id);
        await createOk(ctx.aisha, ctx.group.id, dinner(ctx, {
            description: 'Taxi to airport', category: 'transport', paidBy: a, expenseDate: '2026-10-05',
            splits: [{ userId: a }, { userId: r }],
        }));
        await createOk(ctx.aisha, ctx.group.id, dinner(ctx, {
            description: 'Beach Shack lunch', category: 'food', paidBy: r, expenseDate: '2026-10-20',
            splits: [{ userId: r }, { userId: m }],
        }));
        await createOk(ctx.aisha, ctx.group.id, dinner(ctx, {
            description: '100% fun park', category: 'entertainment', paidBy: m, expenseDate: '2026-11-02',
            splits: [{ userId: m }],
        }));
        const names = (res) => res.body.items.map((e) => e.description).sort();

        expect(names(await list(ctx.aisha, ctx.group.id, '?category=food'))).toEqual(['Beach Shack lunch']);
        expect(names(await list(ctx.aisha, ctx.group.id, `?paidBy=${m}`))).toEqual(['100% fun park']);
      
        expect(names(await list(ctx.aisha, ctx.group.id, `?involving=${r}`))).toEqual(['Beach Shack lunch', 'Taxi to airport']);
        expect(names(await list(ctx.aisha, ctx.group.id, '?from=2026-10-10&to=2026-10-31'))).toEqual(['Beach Shack lunch']);
        expect(names(await list(ctx.aisha, ctx.group.id, '?q=beach'))).toEqual(['Beach Shack lunch']);
     
        expect(names(await list(ctx.aisha, ctx.group.id, `?q=${encodeURIComponent('100%')}`))).toEqual(['100% fun park']);
        expect(names(await list(ctx.aisha, ctx.group.id, `?q=${encodeURIComponent('%')}`))).toEqual(['100% fun park']);
    });

    test('soft-deleted expenses are not listed', async () => {
        const ctx = await setup();
        const gone = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, { description: 'gone' }));
        await createOk(ctx.aisha, ctx.group.id, dinner(ctx, { description: 'kept' }));
        await ctx.aisha.agent.delete(`/api/expenses/${gone.id}`);

        const res = await list(ctx.aisha, ctx.group.id);
        expect(res.body.items.map((e) => e.description)).toEqual(['kept']);
    });

    test("does not leak another group's expenses", async () => {
        const ctx = await setup();
        await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        const other = await ctx.dev.agent.post('/api/groups').send({ name: 'Other' });

        const res = await list(ctx.dev, other.body.group.id);
        expect(res.body.items).toEqual([]);
    });

    test.each([
        ['limit 0', '?limit=0'],
        ['limit 101', '?limit=101'],
        ['limit abc', '?limit=abc'],
        ['a garbage cursor', '?cursor=not-a-real-cursor'],
        ['an unknown category', '?category=gambling'],
        ['a bad date', '?from=yesterday'],
        ['an unknown query parameter', '?page=2'],
    ])('400 for %s', async (_, query) => {
        const ctx = await setup();
        const res = await list(ctx.aisha, ctx.group.id, query);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('403 for a non-member, 401 when logged out', async () => {
        const ctx = await setup();
        expect((await list(ctx.dev, ctx.group.id)).status).toBe(403);
        const res = await request(app).get(`/api/groups/${ctx.group.id}/expenses`);
        expect(res.status).toBe(401);
    });
});

describe('GET /api/expenses/:id', () => {
    test('any member can read it', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));

        const res = await ctx.meera.agent.get(`/api/expenses/${expense.id}`);
        expect(res.status).toBe(200);
        expect(res.body.expense).toEqual(expense);
    });

    test('403 for a non-member', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        const res = await ctx.dev.agent.get(`/api/expenses/${expense.id}`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('NOT_A_MEMBER');
    });

    test('404 for a missing id and for a soft-deleted expense', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        expect((await ctx.aisha.agent.get('/api/expenses/9999')).status).toBe(404);

        await ctx.aisha.agent.delete(`/api/expenses/${expense.id}`);
        expect((await ctx.aisha.agent.get(`/api/expenses/${expense.id}`)).status).toBe(404);
    });

    test('400 for an id that is not a number', async () => {
        const ctx = await setup();
        const res = await ctx.aisha.agent.get('/api/expenses/abc');
        expect(res.status).toBe(400);
    });

    test('401 when logged out', async () => {
        const res = await request(app).get('/api/expenses/1');
        expect(res.status).toBe(401);
    });
});

describe('PATCH /api/expenses/:id', () => {
    const patch = (who, id, body) => who.agent.patch(`/api/expenses/${id}`).send(body);

    test('changing only the description leaves the amount and splits alone', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));

        const res = await patch(ctx.aisha, expense.id, { description: 'Dinner + dessert' });
        expect(res.status).toBe(200);
        expect(res.body.expense).toMatchObject({ description: 'Dinner + dessert', amountCents: 300000, splitType: 'equal' });
        expect(res.body.expense.splits).toEqual(expense.splits);
        expect(res.body.expense.updatedAt >= expense.updatedAt).toBe(true);
    });

    test('amountCents + splitType + splits together recompute and replace every split', async () => {
        const ctx = await setup();
        const [a, r] = [ctx.aisha, ctx.rahul].map((w) => w.user.id);
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));

        const res = await patch(ctx.aisha, expense.id, {
            amountCents: 10001,
            splitType: 'exact',
            splits: [{ userId: a, value: 6000 }, { userId: r, value: 4001 }],
        });
        expect(res.status).toBe(200);
        expect(res.body.expense.amountCents).toBe(10001);
        expect(res.body.expense.splitType).toBe('exact');
        expect(shares(res.body.expense)).toEqual([6000, 4001]);

        const { rows } = await pool.query('SELECT COUNT(*) AS n FROM expense_splits WHERE expense_id = $1', [expense.id]);
        expect(rows[0].n).toBe(2);
    });

    test('the payer, category and date can change; category can be cleared with null', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));

        const res = await patch(ctx.aisha, expense.id, { paidBy: ctx.rahul.user.id, category: null, expenseDate: '2026-11-03' });
        expect(res.status).toBe(200);
        expect(res.body.expense).toMatchObject({
            paidBy: { id: ctx.rahul.user.id, name: 'Rahul' },
            category: null,
            expenseDate: '2026-11-03',
        });
    });

    test('writes an expense.updated activity row that includes the previous amount', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        await patch(ctx.aisha, expense.id, {
            amountCents: 330000,
            splitType: 'equal',
            splits: [{ userId: ctx.aisha.user.id }, { userId: ctx.rahul.user.id }, { userId: ctx.meera.user.id }],
        });

        const { rows } = await pool.query(`SELECT payload FROM activity_log WHERE action = 'expense.updated'`);
        expect(rows).toEqual([{ payload: { description: 'Dinner at Thalassa', amountCents: 330000, previousAmountCents: 300000 } }]);
    });

    test('D3: the payer can edit an expense somebody else created', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, { paidBy: ctx.rahul.user.id }));
        const res = await patch(ctx.rahul, expense.id, { description: 'Edited by payer' });
        expect(res.status).toBe(200);
    });

    test('D3: an admin can edit an expense somebody else created and paid', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.rahul, ctx.group.id, dinner(ctx, { paidBy: ctx.rahul.user.id }));
        const res = await patch(ctx.aisha, expense.id, { description: 'Edited by admin' });
        expect(res.status).toBe(200);
    });

    test('D3: another member gets 403 FORBIDDEN and nothing changes', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        const res = await patch(ctx.meera, expense.id, { description: 'Hacked' });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');

        const check = await ctx.aisha.agent.get(`/api/expenses/${expense.id}`);
        expect(check.body.expense.description).toBe('Dinner at Thalassa');
    });

    test('403 NOT_A_MEMBER for someone outside the group, even with an invalid body', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        const res = await patch(ctx.dev, expense.id, { bogus: true });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('NOT_A_MEMBER');
    });

    test.each([
        ['an empty body', () => ({})],
        ['an unknown field', () => ({ groupId: 2 })],
        ['amountCents without splitType and splits', () => ({ amountCents: 500 })],
        ['splits without amountCents and splitType', (c) => ({ splits: [{ userId: c.aisha.user.id }] })],
        ['exact values that do not add up', (c) => ({ amountCents: 500, splitType: 'exact', splits: [{ userId: c.aisha.user.id, value: 1 }] })],
        ['a date in the future', () => ({ expenseDate: '2999-01-01' })],
        ['a payer who is not a member', (c) => ({ paidBy: c.dev.user.id })],
        ['a split with a non-member', (c) => ({ amountCents: 500, splitType: 'equal', splits: [{ userId: c.dev.user.id }] })],
    ])('400 for %s', async (_, make) => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        const res = await patch(ctx.aisha, expense.id, make(ctx));
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('is atomic: if replacing the splits fails, the old expense and splits are intact', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        jest.spyOn(expensesRepo, 'insertSplits').mockRejectedValueOnce(new Error('boom'));

        const res = await patch(ctx.aisha, expense.id, {
            amountCents: 999,
            splitType: 'equal',
            splits: [{ userId: ctx.aisha.user.id }, { userId: ctx.rahul.user.id }],
        });
        expect(res.status).toBe(500);

        const check = await ctx.aisha.agent.get(`/api/expenses/${expense.id}`);
        expect(check.body.expense).toEqual(expense);
    });

    test('404 for a missing or soft-deleted expense', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        expect((await patch(ctx.aisha, 9999, { description: 'x' })).status).toBe(404);

        await ctx.aisha.agent.delete(`/api/expenses/${expense.id}`);
        expect((await patch(ctx.aisha, expense.id, { description: 'x' })).status).toBe(404);
    });
});

describe('DELETE /api/expenses/:id', () => {
    test('204; afterwards it is 404, absent from the list, but the row is kept with deleted_at set', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));

        const res = await ctx.aisha.agent.delete(`/api/expenses/${expense.id}`);
        expect(res.status).toBe(204);

        expect((await ctx.aisha.agent.get(`/api/expenses/${expense.id}`)).status).toBe(404);
        const list = await ctx.aisha.agent.get(`/api/groups/${ctx.group.id}/expenses`);
        expect(list.body.items).toEqual([]);

        const { rows } = await pool.query('SELECT deleted_at FROM expenses WHERE id = $1', [expense.id]);
        expect(rows).toHaveLength(1);
        expect(rows[0].deleted_at).not.toBeNull();
    });

    test('writes an expense.deleted activity row', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        await ctx.aisha.agent.delete(`/api/expenses/${expense.id}`);

        const { rows } = await pool.query(`SELECT entity_id, payload FROM activity_log WHERE action = 'expense.deleted'`);
        expect(rows).toEqual([{ entity_id: expense.id, payload: { description: 'Dinner at Thalassa', amountCents: 300000 } }]);
    });

    test('D3: the creator, the payer and an admin can delete', async () => {
        const ctx = await setup();
        const byCreator = await createOk(ctx.rahul, ctx.group.id, dinner(ctx, { paidBy: ctx.aisha.user.id }));
        const byPayer = await createOk(ctx.aisha, ctx.group.id, dinner(ctx, { paidBy: ctx.rahul.user.id }));
        const byAdmin = await createOk(ctx.rahul, ctx.group.id, dinner(ctx, { paidBy: ctx.rahul.user.id }));

        expect((await ctx.rahul.agent.delete(`/api/expenses/${byCreator.id}`)).status).toBe(204);
        expect((await ctx.rahul.agent.delete(`/api/expenses/${byPayer.id}`)).status).toBe(204);
        expect((await ctx.aisha.agent.delete(`/api/expenses/${byAdmin.id}`)).status).toBe(204);
    });

    test('D3: another member gets 403 FORBIDDEN and the expense survives', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));

        const res = await ctx.meera.agent.delete(`/api/expenses/${expense.id}`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
        expect((await ctx.aisha.agent.get(`/api/expenses/${expense.id}`)).status).toBe(200);
    });

    test('403 NOT_A_MEMBER for someone outside the group', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        const res = await ctx.dev.agent.delete(`/api/expenses/${expense.id}`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('NOT_A_MEMBER');
    });

    test('404 when it is already deleted or never existed', async () => {
        const ctx = await setup();
        const expense = await createOk(ctx.aisha, ctx.group.id, dinner(ctx));
        await ctx.aisha.agent.delete(`/api/expenses/${expense.id}`);

        expect((await ctx.aisha.agent.delete(`/api/expenses/${expense.id}`)).status).toBe(404);
        expect((await ctx.aisha.agent.delete('/api/expenses/9999')).status).toBe(404);
    });
});
