const {z}=require('zod')

const email=z.string().trim().toLowerCase().pipe(z.email().max(254))

const createGroupSchema=z.strictObject({
    name:z.string().trim().min(1).max(60),
    description:z.string().trim().max(250).optional(),
    currency:z.string().regex(/^[A-Z]{3}$/,'Must be a 3-letter currency code').default('INR')
})

const updateGroupSchema=z.strictObject({
    name:z.string().trim().min(1).max(60).optional(),
    description:z.string().trim().max(250).optional()
})
.refine((b)=>b.name!==undefined || b.description!==undefined,{message:'Nothing to update'})


const addMemberSchema=z.strictObject({email})

const memberParams=z.object({
    id:z.coerce.number().int().positive(),
    userId:z.coerce.number().int().positive()
})

module.exports={createGroupSchema,updateGroupSchema,addMemberSchema,memberParams}