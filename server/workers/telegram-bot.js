require('dotenv').config();

const { Telegraf } = require('telegraf');
const { sequelize, Listing, TelegramConnection } = require('../../db/models');
const { createVehicleFromListing } = require('../crawler/import-vehicle');
const { publishListing } = require('../instagram/publish');
const { resolveConnectToken } = require('../lib/telegram-connect');

const TOKEN_RE = /^[0-9a-f]{32}$/i;

function displayName(from) {
  return (
    [from.first_name, from.last_name].filter(Boolean).join(' ') || from.username || String(from.id)
  );
}

// Public website vehicle preview: FRONT_HOST_NAME/<locale>/inventory/<slug>.
function vehicleUrl(slug) {
  const base = process.env.FRONT_HOST_NAME;
  if (!base || !slug) return null;
  return `${base.replace(/\/$/, '')}/en/inventory/${slug}`;
}

// Registry upsert keyed on chat_id, refreshing the captured profile each time.
async function upsertConnection(ctx) {
  const chatId = String(ctx.chat.id);
  const from = ctx.from || {};
  const [connection] = await TelegramConnection.findOrCreate({
    where: { chatId },
    defaults: {
      chatId,
      telegramUserId: String(from.id),
      firstName: from.first_name || null,
      lastName: from.last_name || null,
      username: from.username || null,
    },
  });
  await connection.update({
    telegramUserId: String(from.id),
    firstName: from.first_name || null,
    lastName: from.last_name || null,
    username: from.username || null,
    lastUsedAt: sequelize.fn('NOW'),
  });
  return connection;
}

function buildBot(token = process.env.TELEGRAM_BOT_TOKEN) {
  const bot = new Telegraf(token);

  bot.start(async ctx => {
    const payload = ctx.startPayload;
    if (!payload || !TOKEN_RE.test(payload)) {
      await ctx.reply('Salom! Dashboarddan "Connect Telegram" tugmasi orqali ulaning.');
      return;
    }

    const connection = await upsertConnection(ctx);
    const ok = await resolveConnectToken(payload, {
      connectionId: connection.id,
      chatId: connection.chatId,
      name: displayName(ctx.from || {}),
    });

    await ctx.reply(
      ok
        ? `✅ Ulandi: ${displayName(ctx.from || {})}. Endi dashboardga qayting.`
        : 'Ulanish havolasi eskirgan. Dashboarddan qaytadan urinib ko‘ring.'
    );
  });

  bot.action(/^pv:(.+)$/, async ctx => {
    const listingId = ctx.match[1];
    try {
      const { vehicle } = await createVehicleFromListing(listingId);
      await ctx.answerCbQuery('✅ Vehicles ga qo‘shildi');
      const url = vehicleUrl(vehicle.slug);
      const firstRow = url
        ? [{ text: '🚗 View vehicle', url }]
        : [{ text: '✅ In vehicles', callback_data: 'noop' }];
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [
          firstRow,
          [{ text: '📸 Post to Instagram', callback_data: `ig:${listingId}` }],
        ],
      });
    } catch (error) {
      await ctx.answerCbQuery(`Xatolik: ${error.message}`.slice(0, 200), { show_alert: true });
    }
  });

  bot.action(/^ig:(.+)$/, async ctx => {
    const listingId = ctx.match[1];
    await ctx.answerCbQuery('Instagram ga yuborilmoqda...');
    try {
      const listing = await Listing.findByPk(listingId);
      if (!listing) {
        await ctx.answerCbQuery('Listing topilmadi', { show_alert: true });
        return;
      }
      const result = await publishListing(listing);
      if (!result.ok) {
        await ctx.answerCbQuery(`Instagram xatolik: ${result.error}`.slice(0, 200), {
          show_alert: true,
        });
        return;
      }
      // Keep the existing first row, flip the Instagram button to a posted state.
      const markup = ctx.callbackQuery.message.reply_markup;
      const firstRow = markup?.inline_keyboard?.[0] || [];
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [firstRow, [{ text: '✅ Posted to Instagram', callback_data: 'noop' }]],
      });
    } catch (error) {
      await ctx.answerCbQuery(`Instagram xatolik: ${error.message}`.slice(0, 200), {
        show_alert: true,
      });
    }
  });

  bot.action('noop', ctx => ctx.answerCbQuery());

  return bot;
}

async function start() {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    console.error('telegram bot worker: TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
  }
  const bot = buildBot();
  process.once('SIGTERM', () => shutdown('SIGTERM', bot));
  process.once('SIGINT', () => shutdown('SIGINT', bot));
  // launch() resolves only once the bot stops, so don't await it here.
  bot.launch().catch(error => {
    console.error('telegram bot worker polling error', error);
    process.exit(1);
  });
  console.log('telegram bot worker started (long polling)');
}

async function shutdown(signal, bot) {
  console.log(`telegram bot worker received ${signal}, shutting down`);
  try {
    bot.stop(signal);
  } catch {
    // already stopped
  }
  await sequelize.close().catch(() => {});
  process.exit(0);
}

if (require.main === module) {
  start().catch(error => {
    console.error('telegram bot worker failed to start', error);
    process.exit(1);
  });
}

module.exports = {
  buildBot,
  upsertConnection,
};
