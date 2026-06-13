import { Telegraf } from "telegraf";
import { eq } from "drizzle-orm";
import { schema } from "@jdm-pro/db";
import { createVehicleFromListing } from "@jdm-pro/worker/importVehicle";
import { publishListing } from "@jdm-pro/worker/instagram";
import { resolveConnectToken } from "../lib/telegramConnect.js";

const TOKEN_RE = /^[0-9a-f]{32}$/i;

function displayName(from) {
  return [from.first_name, from.last_name].filter(Boolean).join(" ") || from.username || String(from.id);
}

function vehicleUrl(slug) {
  const base = process.env.FRONT_HOST_NAME;
  if (!base || !slug) return null;
  return `${base.replace(/\/$/, "")}/en/inventory/${slug}`;
}

// Registry upsert keyed on chat_id, refreshing the captured profile each time.
async function upsertConnection(db, ctx) {
  const chatId = String(ctx.chat.id);
  const from = ctx.from || {};
  const profile = {
    telegramUserId: String(from.id),
    firstName: from.first_name || null,
    lastName: from.last_name || null,
    username: from.username || null,
  };
  const [connection] = await db
    .insert(schema.telegramConnections)
    .values({ chatId, ...profile })
    .onConflictDoUpdate({
      target: schema.telegramConnections.chatId,
      set: { ...profile, lastUsedAt: new Date() },
    })
    .returning();
  return connection;
}

export function buildBot(db, token = process.env.TELEGRAM_BOT_TOKEN) {
  const bot = new Telegraf(token);

  bot.start(async (ctx) => {
    const payload = ctx.startPayload;
    if (!payload || !TOKEN_RE.test(payload)) {
      await ctx.reply('Salom! Dashboarddan "Connect Telegram" tugmasi orqali ulaning.');
      return;
    }

    const connection = await upsertConnection(db, ctx);
    const ok = await resolveConnectToken(payload, {
      connectionId: connection.id,
      chatId: connection.chatId,
      name: displayName(ctx.from || {}),
    });

    await ctx.reply(
      ok
        ? `✅ Ulandi: ${displayName(ctx.from || {})}. Endi dashboardga qayting.`
        : "Ulanish havolasi eskirgan. Dashboarddan qaytadan urinib ko‘ring."
    );
  });

  bot.action(/^pv:(.+)$/, async (ctx) => {
    const listingId = ctx.match[1];
    try {
      const { vehicle } = await createVehicleFromListing(db, listingId);
      await ctx.answerCbQuery("✅ Vehicles ga qo‘shildi");
      const url = vehicleUrl(vehicle.slug);
      const firstRow = url
        ? [{ text: "🚗 View vehicle", url }]
        : [{ text: "✅ In vehicles", callback_data: "noop" }];
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [firstRow, [{ text: "📸 Post to Instagram", callback_data: `ig:${listingId}` }]],
      });
    } catch (error) {
      await ctx.answerCbQuery(`Xatolik: ${error.message}`.slice(0, 200), { show_alert: true });
    }
  });

  bot.action(/^ig:(.+)$/, async (ctx) => {
    const listingId = ctx.match[1];
    await ctx.answerCbQuery("Instagram ga yuborilmoqda...");
    try {
      const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, listingId)).limit(1);
      if (!listing) {
        await ctx.answerCbQuery("Listing topilmadi", { show_alert: true });
        return;
      }
      const result = await publishListing(listing);
      if (!result.ok) {
        await ctx.answerCbQuery(`Instagram xatolik: ${result.error}`.slice(0, 200), { show_alert: true });
        return;
      }
      const markup = ctx.callbackQuery.message.reply_markup;
      const firstRow = markup?.inline_keyboard?.[0] || [];
      await ctx.editMessageReplyMarkup({
        inline_keyboard: [firstRow, [{ text: "✅ Posted to Instagram", callback_data: "noop" }]],
      });
    } catch (error) {
      await ctx.answerCbQuery(`Instagram xatolik: ${error.message}`.slice(0, 200), { show_alert: true });
    }
  });

  bot.action("noop", (ctx) => ctx.answerCbQuery());

  return bot;
}
