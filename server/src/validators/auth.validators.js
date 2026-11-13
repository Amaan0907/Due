const {z}=require('zod')

const email=z.string().trim().toLowerCase().pipe(z.email().max(254))
const password=z.string().min(8).max(72)

const registerSchema=z.strictObject({
    name:z.string().trim().min(2).max(50),
    email,
    password,
})

const loginSchema=z.strictObject({
    email,
    password:z.string().min(1).max(72)
})

const updateSchema=z.strictObject({
    name:z.string().trim().min(2).max(50).optional(),
    currentPassword:z.string().min(1).max(72).optional(),
    newPassword:password.optional()
}).refine((b)=> !b.newPassword ||b.currentPassword,{
    path:['currentPassword'],
    message:'currentPassword is required to set a new password'
}).refine((b)=> b.name !== undefined || b.newPassword !== undefined,{
    message:'Nothing to update'
})

module.exports={registerSchema,loginSchema,updateSchema}