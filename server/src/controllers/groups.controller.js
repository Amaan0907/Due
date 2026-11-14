const groupServices=require('../services/groups.service.js')

const list=async(req,res)=>(
    res.json({items:await groupServices.list(res.user.id)})
)

const create=async(req,res)=>{
    const group=await groupServices.create(req.user,req.valid.body)

    res.status(201).json({group})
}

const get=async(req,res)=>(
res.json(await groupServices.get(req.group.id,req.user.id))
)

const update=async(req,res)=>{
    const group=await groupServices.update(req.user.id,req.group.id,req.valid.body)
    res.status(201).json({group})
}

const remove=async(req,res)=>{
    res.json(await groupServices.remove(req.group.id))
}

const addMember=async(req,res)=>{
    const member=await groupServices.addMember(req.group.id,req.user,req.valid.body.email)

    res.status(201).json({member})
}

const removeMember=async(req,res)=>{
    await groupServices.removeMember(req.user,req.group.id,req.membership,req.params.userId)
    res.status(204).end()
}

module.exports={
    create,
    get,
    list,
    remove,
    addMember,
    removeMember,
    update
}