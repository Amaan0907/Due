const request =require('supertest')
const app=require('../../server/src/app.js')

const {resetDb,closeDb}=require('../helpers/db.js')

const user={name:"Amaan",email:"test@test.com",password:"Amaan@123"}

beforeEach(resetDb)
afterAll(closeDb)


describe('POST /api/auth/register',()=>{
    test('creates the user,sets an httpOnly cookie, hides the hash',async()=>{
        const res=await request(app).post('/api/auth/register').send(user)
        expect(res.status).toBe(201)
        expect(res.body.user).toMatchObject({name:"Amaan",email:"test@test.com"})
        expect(res.body.user.passwordHash).toBeUndefined()
        expect(res.headers['set-cookie'][0]).toMatch(/token=.*HttpOnly/)

})
    test('stores the email lowercase',async()=>{
        const res=await request(app).post('/api/auth/register').send({...user,email:"TEST@test.com"})
        expect(res.status).toBe(201)
        expect(res.body.user.email).toBe('test@test.com')
    })
    test('409 EMAIL_TAKEN for a duplicate email',async()=>{
        await request(app).post('/api/auth/register').send(user)
        const res=await request(app).post('/api/auth/register').send(user)
        expect(res.status).toBe(409)
        expect(res.body.error.code).toBe('EMAIL_TAKEN')
    })
    //Validation Error
    test.each([
        ['short password',{password:'short'}],
        ['bad email',{email:'nope'}],
        ['empty name',{name:''}],
        ['unknown field',{admin:true}],
    ])('400 for %s',async(_,patch)=>{
        const res=await request(app).post('/api/auth/register').send({...user,...patch})
        expect(res.status).toBe(400)
        expect(res.body.error.code).toBe('VALIDATION_ERROR')
    })
})