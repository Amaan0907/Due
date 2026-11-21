const balancesService = require('../services/balances.service.js')

const balances = async (req, res) => res.json(await balancesService.balances(req.group))

const simplify = async (req, res) => res.json(await balancesService.simplify(req.group))

const summary = async (req, res) => res.json(await balancesService.summary(req.user.id))

module.exports = { balances, simplify, summary }
