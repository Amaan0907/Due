const {z}=require('zod')
const {todayUtc,isRealDate}=require('../lib/dates.js')

const CATEGORIES=['food','transport','stay','groceries','utilities','entertainment','shopping','other']

const id=z.number().int().positive()

const calendarDate=z.string().refine(isRealDate,'Must be a real date in YYYY-MM-DD format')

const notInFuture=calendarDate.refine((d)=>d<=todayUtc(),'Date cannot be in the future')

const splitEntry=z.strictObject({
    userId:id,
    value:z.number().int().optional()
})

const shape={
    description:z.string().trim().min(1).max(100),
    amountCents:z.int().min(1).max(1_000_000_000),
    paidBy:id,
    splitType:z.enum(['equal','exact','percent','shares']),
    category:z.enum(CATEGORIES).nullable().optional(),
    expenseDate:notInFuture.optional(),
    splits:z.array(splitEntry).min(1).max(50)
}

const createExpenseSchema=z.strictObject(shape)


const together=(b)=>{
    const sent=[b.amountCents,b.splitType,b.splits].filter((v)=>v!==undefined).length

    return sent===0 || sent===3
}

const updateExpenseSchema=z.strictObject(shape).partial()
    .refine((b)=>Object.keys(b).length>0,{message:'Nothing to update'})
    .refine(together,{message:'amountCents,splitType and splits must be sent together ',path:['splits']})


const listQuerySchema=z.strictObject({
    limit:z.coerce.number().int().min(1).max(100).default(20),
    cursor:z.string().min(1).optional(),
    category:z.enum(CATEGORIES).optional(),
    paidBy:z.coerce.number().int().positive().optional(),
    involving:z.coerce.number().int().positive().optional(),
    from:calendarDate.optional(),
    to:calendarDate.optional(),
    q:z.string().trim().min(1).max(100).optional()
})

module.exports={
    createExpenseSchema,
    updateExpenseSchema,
    listQuerySchema
} 