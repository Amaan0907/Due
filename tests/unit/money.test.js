



const shares=(result)=>result.map((r)=>r.shareCents)


const sum=(arr)=>arr.reduce((a,b)=>a+b,0)


const entries=(obj)=>(
    Object.entries(obj).map(([userId,value])=>({
        userId:Number(userId),
        value
    }))
)

function expectRejected(fn){
    try {
        fn()
    } catch (error) {
        expect(error.status).toBe(400)
        expect(error.code).toBe('VALIDATION_ERROR')
        return
    }

    throw new Error('Expected the call to throw, but it did not')
}


describe('splitEqual',()=>{
    test('₹100.0 amaong 3 people: the extra cent goes to the lowest user id',()=>{
        const result=splitEqual(10000,[1,2,3])
        expect(result).toEqual([
            {userId:1,shareCent:3334},
            {userId:2,shareCent:3333},
            {userId:3,shareCent:3333}
        ])
        expect(sum(shares(result))).toBe(10000)
    })
    test('the result does not depend on the order of the input',()=>{
        expect(splitEqual(10000,[3,1,2])).toEqual(splitEqual(10000,[1,2,3]))
    })

    test('divides evenly when it can',()=>{
        expect(shares(splitEqual(9000,[4,5,6]))).toEqual([3000,3000,3000])
    })
    test('1 cent among 3 people: only the lowest id gets it',()=>{
        expect(shares(splitEqual(1,[1,2,3]))).toEqual([1,0,0])
    })
    test('2 extra cents go to the two lowest ids',()=>{
        expect(shares(splitEqual(11,[1,2,3]))).toEqual([4,4,3])
    })
    test('a single participant owns everything',()=>{
        expect(splitEqual(777,[9])).toEqual([{userId:9,shareCents:777}])
    })
    test('does not change the array it is given',()=>{
        const ids=[3,1,2]
        splitEqual(100,ids)
        expect(ids).toEqual([3,1,2])
    })
    test.Each([
        ['zero total',0,[1,2]],
        ['negative total',-100,[1,2]],
        ['fractional total',10.5,[1,2]],
        ['string total','100',[1,2]],
        ['no participant',100,[]],
        ['duplicate participant',100,[1,1]],
        ['non-integer user id',100,[1,2.4]],
        ['zero user id',100,[0,1]],
    ])('rejects %s',(_,total,ids)=>{
        expectRejected(()=>splitEqual(total,ids))
    })
})

