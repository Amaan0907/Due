const {AppError}= require('../lib/errors.js')


function errorHandler(err,req,res,next){

    if(err instanceof AppError){
        const body= {code:err.code,message:err.message}

        if(err.details) body.details=err.details

        return res.status(err.status).json({error:body})
    }

    if (err.type=='entity.parse.failed'){
        return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Request body is not valid JSON'}})

    }

    req.log.error({err},'Unhandled error')
    res.status(500).json({error:{code:"INTERNAL_ERROR",message:'Something went wrong'}})

}

module.exports=errorHandler