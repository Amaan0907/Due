const {Pool,types}=require("pg")

const env=require("./env.js")


types.setTypeParser(20,(value)=>Number(value))


const pool=new Pool({connectionString:env.databaseUrl,max:10})


async function withTransaction(fn) {
    const client=await pool.connect()
    try {
        await client.query("BEGIN")
        const result =await fn(client)
        await client.query('COMMIT')
        return result
    } catch (error) {
        await client.query("ROLLBACK")
        throw error
    }finally{
        client.release()
    }
}

module.exports={pool,withTransaction}