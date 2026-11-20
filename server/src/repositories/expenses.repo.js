const {pool}=require('../config/db.js')


const EXPENSE_SELECT=`
SELECT e.id,e.group_id,e.description,e.amount_cents,e.split_type,e.category,
        to_char(e.expense_date,'YYYY-MM-DD') AS expense_date,
        e.created_at,e.updated_at,
        e.paid_by,pu.name AS paid_by_name,
        e.created_by,cu.name AS created_by_name,
        COALESCE((
            SELECT json_agg(json_build_object(
                'userId',s.user_id,'name',u.name,'value',s.raw_value,'shareCents',s.share_cents
            ) ORDER BY s.user_id)
            FROM expense_splits s JOIN users u ON u.id=s.user_id
            WHERE s.expense_id=e.id
        ),'[]'::json) AS splits
    FROM expenses e
    JOIN users pu ON pu.id=e.paid_by
    JOIN users cu ON cu.id=e.created_by
`


const toExpense=(r)=>({
    id:r.id,
    groupId:r.group_id,
    description:r.description,
    amountCents:r.amount_cents,
    splitType:r.split_type,
    category:r.category,
    expenseDate:r.expense_date,
    splits:r.splits.map((s)=>({user:{id:s.userId,name:s.name},value:s.value,shareCents:s.shareCents})),
    createdBy:{id:r.created_by,name:r.created_by_name},
    createdAt:r.created_at,
    updatedAt:r.updated_at
})


async function findById(id,db=pool) {
    const {rows}=db.query(
        `${EXPENSE_SELECT} where e.id=$1 AND e.deleted_at IS NULL`,
        [id]
    )
    return rows[0]?toExpense(rows[0]):null
}
const escapeLike=(s)=>s.replace(/[\\%_]/g,'\\$&')


async function list({groupId,limit ,cursor,category,paidBy,involving,from ,to ,q}) {
    const params=[groupId]
    const where=['e.group_id=$1','e.deleted_at IS NULL']


    const add=(sql,...values)=>{
        let text=sql
        for (const value of values){
            params.push(value)
            text=text.replace('?',`${params.length}`)
        }
        where.push(text)
    }

    if(category) add('e.category=?',category)
    if(paidBy)add('e.paid_by=?',paidBy)
    if(involving){
        params.push(involving)
        const n=params.length
        where.push(`(e.paid_by=${n} OR EXISTS (SELECT 1 FROM expense_splits s WHERE s.expense_id=e.id AND s.user_id=$${n}))`)
    }

    if(from) add('e.expense_date>=::date',from)
    if(to) add('e.expense_date<=?::date',to)
    if(q)add(`e.description ILIKE ? ESCAPE '\\'`,`%${escapeLike(q)}%`)
    if(cursor) add('(e.expense_date,e.id) < (?::date,?::bigint)',cursor.d,cursor.i)

    params.push(limit+1)
    const {rows}=await pool.query
(
    `${EXPENSE_SELECT} WHERE ${where.join(' AND ')}
    ORDER BY e.expense_date DESC,e.id DESC
    LIMIT $${params.length}`,
    params
)     
return rows.map(toExpense)   
}

async function insert({ groupId, description, amountCents, paidBy, splitType, category, expenseDate, createdBy }, db = pool) {
    const { rows } = await db.query(
        `INSERT INTO expenses(group_id,description,amount_cents,paid_by,split_type,category,expense_date,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7::date,$8)
        RETURNING id`,
        [groupId, description, amountCents, paidBy, splitType, category, expenseDate, createdBy]
    )
    return rows[0].id
}

async function insertSplits(expenseId, shares, db = pool) {
    await db.query(
        `INSERT INTO expense_splits(expense_id,user_id,share_cents,raw_value)
        SELECT $1::bigint,t.user_id,t.share_cents,t.raw_value
        FROM unnest($2::bigint[],$3::bigint[],$4::numeric[]) AS t(user_id,share_cents,raw_value)`,
        [expenseId, shares.map((s) => s.userId), shares.map((s) => s.shareCents), shares.map((s) => s.value)]
    )
}


async function deleteSplits(expenseId, db = pool) {
    await db.query(`DELETE FROM expense_splits WHERE expense_id=$1`, [expenseId])
}

async function update(id, { description, amountCents, paidBy, splitType, category, expenseDate }, db = pool) {
    const { rowCount } = await db.query(
        `UPDATE expenses
        SET description=$2,amount_cents=$3,paid_by=$4,split_type=$5,category=$6,expense_date=$7::date,updated_at=now()
        WHERE id=$1 AND deleted_at IS NULL`,
        [id, description, amountCents, paidBy, splitType, category, expenseDate]
    )
    return rowCount === 1
}


async function softDelete(id, db = pool) {
    const { rowCount } = await db.query(
        `UPDATE expenses SET deleted_at=now() WHERE id=$1 AND deleted_at IS NULL`,
        [id]
    )
    return rowCount === 1
}

module.exports={
    findById,
    list,
    insert,
    insertSplits,
    deleteSplits,
    update,
    softDelete
}