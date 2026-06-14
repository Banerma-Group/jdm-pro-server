const API_BASE = "https://api.telegram.org";

export function createTelegram(token = process.env.TELEGRAM_BOT_TOKEN) {
  if (!token) {
    return {
      send: async () => {},
      sendPhoto: async () => {},
    };
  }

  async function call(method, body) {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  return {
    async send(chatId, text) {
      await call("sendMessage", { chat_id: chatId, text, disable_web_page_preview: false });
    },

    // Cover photo + caption + inline keyboard. Telegram media groups can't carry
    // inline buttons, so a single cover photo is used for the actionable post.
    async sendPhoto(chatId, photoUrl, caption, inlineKeyboard) {
      const payload = {
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      };
      if (inlineKeyboard) payload.reply_markup = { inline_keyboard: inlineKeyboard };
      await call("sendPhoto", payload);
    },
  };
}
