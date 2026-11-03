class AppError extends Error{
    constructor(status,code,message,details){
        super(message)
        this.status=status
        this.code=code
        this.details=details
    }
}

const badRequest=(message,details)=> new AppError(400,'VALIDATION_ERROR',message,details)

const unauthenticated=(message='Please Log In')=>new AppError(401,'UNAUTHENTICATED',message)

const forbidden=(message='You do no0t have permission to do this')=> new AppError(403,'FORBIDDEN',message)

const notAMember=()=> new AppError(403,'NOT_A_MEMBER','you are not a member of this group')

const notFound=(what='Resource')=> new AppError(404,'NOT_FOUND',`${what} not found`)

const conflict=(code,message)=>new AppError(409,code,message)

module.exports={
    badRequest,
    unauthenticated,
    forbidden,
    notAMember,
    notFound,
    conflict
}