const dotenv=require("dotenv").config()
const {z, object} =require("zod")


const schema=z.object({
    NODE_ENV:z.enum(['development','test','production']).default('development'),
    PORT:z.coerce.number().int().positive().default(4000),
    DATABASE_URL:z.url(),
    TEST_DATABASE_URL:z.url(),
    JWT_SECRET:z.string().min(32),
    CLIENT_ORIGIN:z.httpUrl(),
    LOG_LEVEL:z.enum(['fatal','error','warn','info','debug','trace','silent']).default("info")
})


const parsed=schema.safeParse(process.env)

if(!parsed.success){
    console.error("Invalid environment variables: ")
    for (const issue of parsed.error.issues) console.error(` ${issue.path.join('.')}: ${issue.message}`)
    process.exit(1)
}

const data=parsed.data
console.log(env)
const env=Object.freeze(
    {
        ...data,
        databaseUrl:data.NODE_ENV==="test"?data.TEST_DATABASE_URL:data.DATABASE_URL,
        isProd:data.NODE_ENV==="production",
        isTest:data.NODE_ENV="test"
    }
)

module.exports=env