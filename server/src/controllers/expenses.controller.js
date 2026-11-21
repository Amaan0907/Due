const expenseServices = require('../services/expenses.service.js')

const list = async (req, res) => {
    res.json(await expenseServices.list(req.group.id, req.valid.query))
}

const create = async (req, res) => {
    const expense = await expenseServices.create(req.group.id, req.user, req.valid.body)
    res.status(201).json({ expense })
}

const get = async (req, res) => {
    res.json({ expense: req.expense })
}

const update = async (req, res) => {
    const expense = await expenseServices.update(req.expense, req.user, req.valid.body)
    res.json({ expense })
}

const remove = async (req, res) => {
    await expenseServices.remove(req.expense, req.user)
    res.status(204).end()
}

module.exports = { list, create, get, update, remove }
