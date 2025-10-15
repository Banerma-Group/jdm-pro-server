const express = require('express');
const route = require('../../utils/async-handler');
const { User } = require('../../../db/models');
const { serialize } = require('../../../db/serializers');
const ensureAuth = require('../../middleware/ensure-auth');

const router = express.Router();

const PRIVATE_EXCLUDE = [
  'email',
];

router.get(
  '/:id',
  ensureAuth(),
  route(async function (req, res) {
    const { id } = req.params;

    const isSelf = String(req.user.id) === String(id);

    const user = await User.findByPk(id, {
      attributes: isSelf
        ? undefined // self → fetch ALL columns
        : { exclude: PRIVATE_EXCLUDE }, // others → all except excluded ones
      // include: isSelf ? [{ model: LoyalUsersMv, as: 'loyalty' }] : []
    });

    if (!user) {
      return res.sendStatus(404);
    }
    res.send({data: user});
  })
);

module.exports = router;
