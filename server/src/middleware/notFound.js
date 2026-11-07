const {notFound} =require('../lib/errors.js')


module.exports=(req,res,next)=>next(notFound('Route'))