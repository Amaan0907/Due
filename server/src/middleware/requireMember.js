const groupsRepo=require('../repositories/groups.repo')

const {badRequest, notFound, notAMember, forbidden}=require('../lib/errors.js')

async function requireMember(req,res,next){
    const groupId=Number(req.params.id)
    if(!Number.isInteger(groupId) || groupId <1){
        throw badRequest('Invalid request')
    }

    const access= await groupsRepo.findAccess(groupId,req.user.id)
    if(!access){
        throw notFound('Group')
    }
    if(!access.role){
        throw notAMember()
    }


    req.group={id:access.id,currency:access.currency}
    req.membership={role:access.role}
    next()
}

async function requireAdmin(req,res,next) {
    if(req.membership.role!=='admin'){
        throw forbidden('This can only be accessed only by Admin of group')
    }
    next()
} 

module.exports={
    requireMember,
    requireAdmin
}