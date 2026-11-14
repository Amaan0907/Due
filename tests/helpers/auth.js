const request = require('supertest');
const app = require('../../server/src/app.js');

// Registers a user and returns an agent that is already logged in as them.
async function signUp(name) {
    const agent = request.agent(app);
    const res = await agent
        .post('/api/auth/register')
        .send({ name, email: `${name.toLowerCase()}@example.com`, password: 'password123' });
    return { agent, user: res.body.user };
}

module.exports = { signUp };
