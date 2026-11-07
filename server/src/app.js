const express = require('express')
const helmet=require('helmet')
const cors=require('cors')
const cookieParser=require('cookie-parser')

const pinohttp=require('pino-http')

const env=require('./config/env.js')
const logger=require('./lib/logger.js')
const routes=require('./routes')
const notFound=require('./middleware/notFound.js')
const errorHandler = require('./middleware/errorHandler.js')


const app=express()

app.set('etag',false)
app.use(helmet())
app.use(cors({origin:env.CLIENT_ORIGIN,credentials:true}))
app.use(express.json())
app.use(cookieParser())
app.use(pinohttp({logger}))

app.use('/api',routes)

app.use(notFound)
app.use(errorHandler)

module.exports=app
