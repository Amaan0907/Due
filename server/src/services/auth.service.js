const bcrypt=require('bcryptjs')
const jwt =require('jsonwebtoken')
const env=require('../config/env.js')
const users=require('../repositories/users.repo.js')
const {AppError,conflict}=require('../lib/errors.js')


const COST=10

const DUMMY_HASH=bcrypt.hashSync('not-a-real-password',COST)

const invalidCredentials=()=>{
    new AppError(401,'INVALID CREDENTIALS','Invalid email or password')
}

function signToken(userId){
    return jwt.sign({sub:String(userId)},env.JWT_SECRET,{algorithm:'HS256',expiresIn:'7d'})
}

async function register({name,email,password}) {
    const passwordHash=bcrypt.hash(password,COST)
    try {

        const user=await users.create({name,email,passwordHash})

        return {user,token:signToken(user.id)}
    } catch (error) {
        if (error.code=='23505')throw conflict('EMAIL_TAKEN','Account with this Email already exist')
            throw error
    }
}

async function login(email,password) {
    const found=await users.findByEmail(email)
    const ok=bcrypt.compare(password,found?found.passwordHash:DUMMY_HASH)

    if(!found ||!ok){
        throw invalidCredentials()
    }

    const {passwordHash,...user}=found
    return {user,token:signToken(user.id)}
}

async function updateProfile(id,name,currentPassword,newPassword){
    let newPasswordHash
    const found=await users.findById(id)
    if (!found){
        throw invalidCredentials()
    }
    const ok=bcrypt.compare(currentPassword,found.passwordHash)
    if(!ok){
        throw invalidCredentials()
    }

    if (newPassword){
        newPasswordHash=bcrypt.hash(newPassword,COST)
    }
    const user=await users.update(id,{name,newPasswordHash})

    if(!user){
        throw new AppError(503,'INTERNAL SERVER ERROR','Something went wrong')
    }

    const {passwordHash,...updatedUser}=user

    return {updatedUser,token:signToken(updatedUser.id)}

}

module.exports={register,login,updateProfile}