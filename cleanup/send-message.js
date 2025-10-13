require('dotenv').config();

const { telegramClient, Api } = require('../server/services/telegram');

// const usernames = ['Luckyperson_77', 'ASQARJON_ADHAMOVICH_OFFICIAL', 'faxriddin0302', 'nilufar_Axrorovna', 'anva_rmansurov', 'Muhayyo_4321'];
// const message = `🔸 Assalomu alaykum. Men telegramdagi **YukUz Logistika Bot** ilovasining vakiliman. Botimizni aktiv ishlatib kelayotgan foydalanaluvchilar orasida so'rovnoma o'tkazyapmiz.\n2 daqiqa vaqtingizni ajratib quyidagi savollarga javob berib o'ting.\n\n⏺ botimizni ishlatishda nima kamchilik yoki noqulayliklari bor?\n⏺ botimizning yana qo'shimcha nima imkoniyatlari bo'lishini xoxlar edingiz (masalan: qidiruv yoki yuklar ma'lumotlari qismida).\n\n🔸 Bu savollarga javoblaringiz botimizni yanada qulay va samarali qilishga yordam beradi. **Oldindan Rahmat**\n\n Bot: https://t.me/yuk_uz_logistika_bot`;

const usernames = ['uzbekistonboylabyukla', 'Yukla24_uzb', 'YUK_trans_Uzbb'];

async function sendMessagesToUsers() {
  const client = telegramClient(process.env.TELEGRAM_API_SESSION);

  try {
    await client.connect();

    console.log('Client started!');

    for (const username of usernames) {
      try {
        const user = await client.getEntity(username);
        console.log(user.id.value + '');
        // await client.sendMessage(user, { message, linkPreview: false, parse_mode: 'Markdown' });
        // console.log(`Message sent to ${username}`);
      } catch (error) {
        console.error(`Failed to send message to ${username}:`, error.message);
      }
    }

    await client.disconnect();
    console.log('Client disconnected!');
  } catch (error) {
    console.error(`Failed to send message to ${userId}:`, error);
  }
}

sendMessagesToUsers();
