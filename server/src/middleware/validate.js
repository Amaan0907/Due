const {badRequest}=require('../lib/errors.js')


// Usage: router.post('/', validate({ body: createGroupSchema }), controller.create)
// Validated data goes in req.valid.body / req.valid.query / req.valid.params.
function validate(schemas){
    return (req,res,next)=>{
        req.valid={}
        for (const part of ['params','query','body']){
            if(!schemas[part]) continue
            const result =schemas[part].safeParse(req[part])

            if(!result.success){
                const details=result.error.issues.map((issue)=>({
                    path:issue.path.join('.') || part,
                    message: issue.message
                }))
                return next(badRequest('Invalid request',details))
            }
            req.valid[part]=result.data
        }
        next()
    }
}

module.exports=validate