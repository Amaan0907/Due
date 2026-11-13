const env=require('../config/env.js')
const authService =require('../services/auth.service.js')


const COOKIE={
    httpOnly:true,
    secure:env.isProd,
    sameSite:env.isProd?"none":"lax",
    path:"/"
}


const setSession=(res,token)=>{
    res.cookie('token',token,{
        ...COOKIE,
        maxAge:7*24*60*60*1000
    })
}

const registerController=async(req,res)=>{
    const {user,token}=await authService.register(req.valid.body)

    setSession(res,token)
    res.status(201).json({user:user})
}

const loginController=async (req,res)=>{
    const {user,token}=await authService.login(req.valid.body)
    setSession(res,token)
    res.json({user})
}

const logoutController=(req,res)=>{
    res.clearCookie('token',COOKIE)
    res.status(204).end()
}

const currentUserController=(req,res)=>{
    res.json(req.user)
}

const updateUserController=async (req,res)=>{
    const {user,token}=await authService.updateProfile(req.user.id,req.valid.body)
    setSession(res,token)

    res.status(201).json({user})
}

module.exports={
    registerController,
    loginController,
    logoutController,
    currentUserController,
    updateUserController

}