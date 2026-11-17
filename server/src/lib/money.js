const {badRequest}= require('./errors')


function assertTotal(totalCents){
    if(!Number.isSafeInteger(totalCents)||totalCents<1){
        throw badRequest('Amount must be a positive whole number of cents')
    }
}

function assertParticipants(userIds){
    if (!Array.isArray(userIds) || userIds.length===0){
        throw badRequest('At least one participant is required')
    }
    const seen =new Set()

    for(const id of userIds){
        if(!Number.isInteger(id)|| id<1){
            throw badRequest('Invalid participant')
        }

        if(seen.has(id)){
            throw badRequest(`Participant ${id} appears more than once`)
        }

        seen.add(id)
    }
}

const byUserID=(a,b)=>a.userId-b.userId

function splitEqual(totalCents,userIds){
    assertTotal(totalCents)
    assertParticipants(userIds)


    const sorted=[...userIds].sort((a,b)=>a-b)

    const base=Math.floor(totalCents/sorted.length)

    let remainder=totalCents-base*sorted.length

    return sorted.map((userId)=>({
        userId:userId,
        shareCents:base+(remainder-- >0?1:0)
    }))
}

function splitExact(totalCents,entries){

    assertTotal(totalCents)
    assertParticipants(Array.isArray(entries)?entries.map((e)=>e.userId):entries)

    for (const {userId,value} of entries){
        if(!Number.isSafeInteger(value)|| value<0){
           throw badRequest(`Amount for participant ${userId} is not valid`)
        }

        
    }
    const total=entries.reduce((s,e)=>s+e.value,0)
    if(total!==totalCents){
       throw badRequest('Amount provided is not sufficient')
    }

    return [...entries].sort(byUserID).map(({userId,value})=>({userId:userId,shareCents:value}))
}

function apportion(totalCents,entries){
    const totalWeight=entries.reduce((s,e)=>s+e.value,0)
    if(!Number.isSafeInteger(totalCents*totalWeight)){
        throw badRequest('Amount or weights are too large')
    }

    const rows=entries.map(({userId,value})=>{
        const product=totalCents*value
        return {userId,shareCents:Math.floor(product/totalWeight),remainder:product%totalWeight}
    })

    const leftover = totalCents - rows.reduce((s, r) => s + r.shareCents, 0);
    [...rows]
        .sort((a, b) => b.remainder - a.remainder || a.userId - b.userId)
        .slice(0, leftover)
        .forEach((r) => {
            r.shareCents += 1;
        });
    
    return rows.sort(byUserID).map(({userId,shareCents})=> ({userId,shareCents}))
}

function splitPercent(totalCents,entries){
    assertTotal(totalCents)
    assertParticipants(Array.isArray(entries)?entries.map((e)=>e.userId):entries)

    for(const {userId,value} of entries){
        if(!Number.isInteger(value) || value<0 || value>10000){
            throw badRequest(`Percentage for participant ${userId} must be between 0 and 100`)
        }
    }
    const total=entries.reduce((s,e)=>s+e.value,0)
    if(total!==10000){
        throw badRequest('Percentage must add up to 100%')
    }
    return apportion(totalCents,entries)
}

function splitShares(totalCents,entries){
    assertTotal(totalCents)
    assertParticipants(Array.isArray(entries)?entries.map((e)=>e.userId):entries)

    for (const {userId,value}of entries){
        if(!Number.isInteger(value)|| value<1){
            throw badRequest(`Shares for participant ${userId} must be a whole number, 1 or more`)
        }
    }

    return apportion(totalCents,entries)
}


function computeSplit(type,totalCents,entries){
    if(!Array.isArray(entries)){
        throw badRequest(`At least one participant is required`)
    }

    let result;
    switch(type){
        case 'equal':
            result=splitEqual(totalCents,entries.map((e)=>e.userId))
            break
        case 'exact':
            result=splitExact(totalCents,entries)
            break
        case 'percent':
            result=splitPercent(totalCents,entries)
            break
        case 'shares':
            result=splitShares(totalCents,entries)
            break
        default:
            throw badRequest(`Unknown split type: ${type}`)
    }


    const entered=new Map(entries.map((e)=>[e.userId,e.value??null]))
    return result.map((r)=>({...r,value:type==='equal'?null:entered.get(r.userId)}))
}

const sumShares=(shares)=>shares.reduce((s,r)=>s+r.shareCents,0)

module.exports={
    splitEqual,
    splitExact,
    splitPercent,
    splitShares,
    computeSplit,
    sumShares
}



