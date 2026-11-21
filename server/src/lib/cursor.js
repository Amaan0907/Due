const {badRequest}=require('./errors.js')
const {isRealDate}=require('./dates.js')

const encode=({d,i})=>Buffer.from(JSON.stringify({d,i})).toString('base64url')


function decode(cursor){
    try {
        const {d,i}=JSON.parse(Buffer.from(cursor,'base64url').toString())
        if(isRealDate(d) && Number.isSafeInteger(i) && i>0){
            return {d,i}
        }
    } catch (error) {
        
    }

    throw badRequest('Invalid cursor',[{path:'cursor',message:'Invalid cursor'}])
}

module.exports={encode,decode}