const pino = require('pino')
const env = require('../config/env')

const logger=pino({
    level:env.NODE_ENV==="test"?"silent":env.LOG_LEVEL,
    transport:env.isProd?undefined:{
        target:'pino-pretty',options:{colorize:true},
        
    },
    redact:['req.headers.cookie','req.headers.authorization']
}
)

module.exports=logger