const request = require('supertest');
const app = require('../../server/src/app.js');
const { pool, resetDb, closeDb } = require('../helpers/db.js');
const { signUp } = require('../helpers/auth.js');

beforeEach(resetDb);
afterAll(closeDb);

// Aisha creates "Goa Trip". Rahul and Meera are registered but not in the group yet.
async function setup() {
    const aisha = await signUp('Aisha');
    const rahul = await signUp('Rahul');
    const meera = await signUp('Meera');
    const res = await aisha.agent.post('/api/groups').send({ name: 'Goa Trip' });
    
    return { aisha, rahul, meera, group: res.body.group };
}

const addMember = (who, groupId, email) =>
    who.agent.post(`/api/groups/${groupId}/members`).send({ email });

describe('POST /api/groups', () => {
    test('creates the group; the creator becomes its only admin', async () => {
        const { aisha, group } = await setup();
       
        expect(group).toMatchObject({
            name: 'Goa Trip',
            currency: 'INR',
            memberCount: 1,
            myRole: 'admin',
            createdBy: { id: aisha.user.id, name: 'Aisha' },
        });
    });

    test('writes a group.created activity row', async () => {
        const { group } = await setup();
        const { rows } = await pool.query('SELECT action FROM activity_log WHERE group_id = $1', [group.id]);
        expect(rows.map((r) => r.action)).toEqual(['group.created']);
    });

    test.each([
        ['empty name', { name: '' }],
        ['bad currency', { name: 'X', currency: 'rupees' }],
        ['unknown field', { name: 'X', admin: true }],
    ])('400 for %s', async (_, body) => {
        const { aisha } = await setup();
        const res = await aisha.agent.post('/api/groups').send(body);
        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    test('401 when not logged in', async () => {
        const res = await request(app).post('/api/groups').send({ name: 'X' });
        expect(res.status).toBe(401);
    });
});

describe('GET /api/groups', () => {
    test('lists only the caller\'s groups', async () => {
        const { aisha, rahul } = await setup();
        expect((await aisha.agent.get('/api/groups')).body.items).toHaveLength(1);
        expect((await rahul.agent.get('/api/groups')).body.items).toHaveLength(0);
    });
});

describe('GET /api/groups/:id', () => {
    test('a member sees the group and its members', async () => {
        const { aisha, group } = await setup();
        const res = await aisha.agent.get(`/api/groups/${group.id}`);
        expect(res.status).toBe(200);
        expect(res.body.group.id).toBe(group.id);
        expect(res.body.members).toHaveLength(1);
        expect(res.body.members[0]).toMatchObject({ role: 'admin', user: { name: 'Aisha' } });
    });

    test('403 NOT_A_MEMBER for an outsider', async () => {
        const { rahul, group } = await setup();
        const res = await rahul.agent.get(`/api/groups/${group.id}`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('NOT_A_MEMBER');
    });

    test('404 for a group that does not exist', async () => {
        const { aisha } = await setup();
        expect((await aisha.agent.get('/api/groups/999999')).status).toBe(404);
    });

    test('400 for a malformed id', async () => {
        const { aisha } = await setup();
        expect((await aisha.agent.get('/api/groups/abc')).status).toBe(400);
    });
});

describe('PATCH /api/groups/:id', () => {
    test('an admin can rename the group', async () => {
        const { aisha, group } = await setup();
        const res = await aisha.agent.patch(`/api/groups/${group.id}`).send({ name: 'Goa 2026', description: 'Dec' });
        expect(res.status).toBe(200);
        expect(res.body.group).toMatchObject({ name: 'Goa 2026', description: 'Dec' });
    });

    test('403 FORBIDDEN for a non-admin member', async () => {
        const { aisha, rahul, group } = await setup();
        await addMember(aisha, group.id, 'rahul@example.com');
        const res = await rahul.agent.patch(`/api/groups/${group.id}`).send({ name: 'Hacked' });
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('400 when trying to change the currency', async () => {
        const { aisha, group } = await setup();
        const res = await aisha.agent.patch(`/api/groups/${group.id}`).send({ currency: 'USD' });
        expect(res.status).toBe(400);
    });
});

describe('DELETE /api/groups/:id', () => {
    test('an admin deletes the group; it is gone afterwards', async () => {
        const { aisha, group } = await setup();
        expect((await aisha.agent.delete(`/api/groups/${group.id}`)).status).toBe(204);
        expect((await aisha.agent.get(`/api/groups/${group.id}`)).status).toBe(404);
    });

    test('403 for a non-admin member', async () => {
        const { aisha, rahul, group } = await setup();
        await addMember(aisha, group.id, 'rahul@example.com');
        
        expect((await rahul.agent.delete(`/api/groups/${group.id}`)).status).toBe(403);
    });
});

describe('POST /api/groups/:id/members', () => {
    test('adds a member with role "member" and logs it', async () => {
        const { aisha, group } = await setup();
        const res = await addMember(aisha, group.id, 'rahul@example.com');
        expect(res.status).toBe(201);
        expect(res.body.member).toMatchObject({ role: 'member', user: { name: 'Rahul' } });
        const { rows } = await pool.query(`SELECT 1 FROM activity_log WHERE group_id = $1 AND action = 'member.added'`, [group.id]);
        expect(rows).toHaveLength(1);
    });

    test('any member can add people, not only admins', async () => {
        const { aisha, rahul, group } = await setup();
        await addMember(aisha, group.id, 'rahul@example.com');
        expect((await addMember(rahul, group.id, 'meera@example.com')).status).toBe(201);
    });

    test('404 USER_NOT_FOUND for an unknown email', async () => {
        const { aisha, group } = await setup();
        const res = await addMember(aisha, group.id, 'nobody@example.com');
        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    test('409 ALREADY_MEMBER when added twice', async () => {
        const { aisha, group } = await setup();
        await addMember(aisha, group.id, 'rahul@example.com');
        const res = await addMember(aisha, group.id, 'rahul@example.com');
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('ALREADY_MEMBER');
    });

    test('403 for an outsider', async () => {
        const { rahul, group } = await setup();
        expect((await addMember(rahul, group.id, 'meera@example.com')).status).toBe(403);
    });
});

describe('DELETE /api/groups/:id/members/:userId', () => {
    test('an admin removes a member', async () => {
        const { aisha, rahul, group } = await setup();
        await addMember(aisha, group.id, 'rahul@example.com');
        const res = await aisha.agent.delete(`/api/groups/${group.id}/members/${rahul.user.id}`);
        expect(res.status).toBe(204);
        expect((await rahul.agent.get(`/api/groups/${group.id}`)).status).toBe(403); // access is gone
    });

    test('a member can leave the group', async () => {
        const { aisha, rahul, group } = await setup();
        await addMember(aisha, group.id, 'rahul@example.com');
        expect((await rahul.agent.delete(`/api/groups/${group.id}/members/${rahul.user.id}`)).status).toBe(204);
    });

    test('403 when a non-admin removes someone else', async () => {
        const { aisha, rahul, meera, group } = await setup();
        await addMember(aisha, group.id, 'rahul@example.com');
        await addMember(aisha, group.id, 'meera@example.com');
        const res = await rahul.agent.delete(`/api/groups/${group.id}/members/${meera.user.id}`);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe('FORBIDDEN');
    });

    test('409 LAST_ADMIN when the only admin tries to leave', async () => {
        const { aisha, group } = await setup();
        const res = await aisha.agent.delete(`/api/groups/${group.id}/members/${aisha.user.id}`);
        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('LAST_ADMIN');
    });

    test('404 when the target is not in the group', async () => {
        const { aisha, rahul, group } = await setup();
        const res = await aisha.agent.delete(`/api/groups/${group.id}/members/${rahul.user.id}`);
        expect(res.status).toBe(404);
    });
});
