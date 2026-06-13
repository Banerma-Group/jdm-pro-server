const express = require('express');
const asyncHandler = require('../../utils/async-handler');
const { TelegramConnection } = require('../../../db/models');
const { createConnectToken, getConnectToken } = require('../../lib/telegram-connect');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TOKEN_RE = /^[0-9a-f]{32}$/i;

function botUsername() {
  return process.env.TELEGRAM_BOT_USERNAME || '';
}

function toPlain(row) {
  if (!row) return row;
  return typeof row.toJSON === 'function' ? row.toJSON() : row;
}

// Start the connect handshake: mint a single-use token and the deep link the
// dashboard opens. The bot resolves the token when the user presses Start.
router.post(
  '/connect-token',
  asyncHandler(async (req, res) => {
    const token = await createConnectToken();
    const username = botUsername();
    const deepLink = username ? `https://t.me/${username}?start=${token}` : null;
    res.send({ token, deepLink });
  })
);

// Dashboard polls this until the bot reports the connection.
router.get(
  '/connect-token/:token',
  asyncHandler(async (req, res) => {
    if (!TOKEN_RE.test(req.params.token)) return res.status(404).send({ error: 'not found' });

    const state = await getConnectToken(req.params.token);
    if (!state) return res.send({ status: 'expired' });
    if (state.status !== 'connected') return res.send({ status: 'pending' });

    const connection = state.connectionId
      ? await TelegramConnection.findByPk(state.connectionId)
      : null;
    res.send({ status: 'connected', connection: toPlain(connection) });
  })
);

router.get(
  '/connections',
  asyncHandler(async (req, res) => {
    const rows = await TelegramConnection.findAll({ order: [['created_at', 'DESC']] });
    res.send(rows.map(toPlain));
  })
);

router.delete(
  '/connections/:id',
  asyncHandler(async (req, res) => {
    if (!UUID_RE.test(req.params.id)) return res.status(404).send({ error: 'not found' });
    const count = await TelegramConnection.destroy({ where: { id: req.params.id } });
    if (!count) return res.status(404).send({ error: 'not found' });
    res.send({ ok: true });
  })
);

module.exports = router;
