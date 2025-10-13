require('dotenv').config({});

const { Op, Sequelize } = require('sequelize');
const { AnalyticsEvent, User, sequelize } = require('../db/models');
const { Telegraf } = require('telegraf');
const { escapeChar } = require('../server/bot-app/utils/generate-message');
const path = require('path');
const fs = require('fs');

// const videoPath = path.resolve(__dirname, './update.mp4');
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

const updateMessages = {
  uz: `📢 Assalomu alaykum!\n\nYukon ilovamizda yangi yangilanish chiqdi 🚀 

Iltimos, Play Marketga kirib ilovani *update* qilib, yangi versiyani o‘rnating ✅`,

  ru: `📢 Здравствуйте!\n\nВ нашем приложении Yukon вышло новое обновление 🚀 

Пожалуйста, зайдите в Play Market, обновите приложение и установите последнюю версию ✅`,

  'uz-Cyrl': `📢 Ассалому алайкум!\n\nYukon иловамизда янги янгиланиш чиқди 🚀 

Илтимос, Play Market га кириб иловани *update* қилиб, янги версияни ўрнатинг ✅`
};


// const updateMessages = {
//   uz: `📱 YANGILIK! Endi bizning ANDROID ILOVAMIZ mavjud!

// Do‘stlar, sizning qulayligingiz uchun endi bizning xizmatlarimizni maxsus Android ilovamiz orqali ham foydalanishingiz mumkin! 🙌

// 🤖 Botdan foydalanishdan charchadingizmi? Unda ayni siz uchun yangilik:

// ✅ Ilovamiz orqali foydalanish ancha oson va tezroq!
// ✅ Bot orqali xarid qilgan obunangiz ilovada ham avtomatik ishlaydi!
// ✅ Barcha imkoniyatlar va funksiyalar bir joyda – mobil ilova ichida!

// 📲 Ilovani yuklab oling va qulaylikdan bahramand bo‘ling!

// Hurmat bilan, Yukon jamoasi! @marina_laty`,

//   ru: ``,

//   uz_cyr: ``,
// };

// Statistikani saqlash uchun global o‘zgaruvchilar
let stats = {
  userBlockedBot: 0,
  userDeactivatedBot: 0,
  chatNotFound: 0,
  userNotFound: 0,
  sent: 0,
  totalUsers: 0,
};

function printStats() {
  console.log('📊 Statistika:');
  console.log(`➡️ Jami foydalanuvchilar: ${stats.totalUsers}`);
  console.log(`✅ Yuborilgan: ${stats.sent}`);
  console.log(`⛔ Bloklaganlar: ${stats.userBlockedBot}`);
  console.log(`🗑️ Deaktivatsiya qilinganlar: ${stats.userDeactivatedBot}`);
  console.log(`❓ Chat topilmadi: ${stats.chatNotFound}`);
  console.log(`🚫 Foydalanuvchi topilmadi: ${stats.userNotFound}`);
}

// Script to‘xtaganda statistikani chiqarish
process.on('exit', printStats);
process.on('SIGINT', () => {
  console.log('\n❗ SIGINT (Ctrl+C) olindi. Dasturni to‘xtatish...');
  process.exit();
});
process.on('uncaughtException', err => {
  console.error('❌ Kutilmagan xatolik:', err);
  process.exit(1);
});

async function getInactiveBotUserIds() {
  try {
    const inactiveUsers = await sequelize.query(
      `
            WITH active_bot_users AS (
                SELECT DISTINCT user_id
                FROM analytics_events
                WHERE platform = 'bot' 
                  AND created_at >= NOW() - INTERVAL '30 days'
            )
            SELECT DISTINCT user_id
            FROM analytics_events
            WHERE platform = 'bot' 
              AND user_id NOT IN (SELECT user_id FROM active_bot_users);
            `,
      { type: sequelize.QueryTypes.SELECT }
    );
    return inactiveUsers.map(user => user.user_id);
  } catch (err) {
    console.error('Inactive user IDs olishda xatolik yuz berdi:', err);
    return [];
  }
}

async function getActiveUserIds() {
  try {
    // Foydalanuvchilarning faolligini aniqlash uchun query
    const activeUsers = await AnalyticsEvent.findAll({
      attributes: ['user_id'],
      where: {
        platform: 'bot',
        created_at: {
          [Op.gte]: Sequelize.literal("CURRENT_DATE - interval '30 days'"), // So‘nggi 30 kun ichidagi so‘rovlar
        },
      },
      group: ['user_id'], // Faqat unikal user_idlar
    });

    // Faqat user_idlarini qaytarish
    return activeUsers.map(user => user.user_id);
  } catch (err) {
    console.error('Foydalanuvchilarni olishda xatolik yuz berdi:', err);
    return [];
  }
}

function escapeMarkdownV2(text) {
  const escapeChars = [
    '_',
    '*',
    '[',
    ']',
    '(',
    ')',
    '~',
    '`',
    '>',
    '#',
    '+',
    '-',
    '=',
    '|',
    '{',
    '}',
    '.',
    '!',
  ];
  return text
    ?.split('')
    .map(c => (escapeChars.includes(c) ? '\\' + c : c))
    .join('');
}

async function sendUpdateMessage(batchSize = 800, userIds) {
  stats.totalUsers = userIds.length;

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);
    console.log(`Sending batch ${i / batchSize + 1} of ${Math.ceil(userIds.length / batchSize)}`);

    const users = await User.findAll({
      where: { id: batch },
    });

    await Promise.all(
      users.map(async currentUser => {
        if (!currentUser) {
          stats.userNotFound++;
          return;
        }

        let language = currentUser.selectedLang || 'uz';
        const label = escapeMarkdownV2("Android ilova");
        const url = escapeMarkdownV2("https://play.google.com/store/apps/details?id=yukon.uz.app");
        let  messageTemplate = `[${label}](${url})\n\n`;
        messageTemplate += escapeChar(updateMessages[language]);
        // const messageTemplate = escapeChar(updateMessages[language]);
        // const messageTemplate = updateMessages[language];

        // if (!fs.existsSync(videoPath)) {
        //   console.error('❌ Video topilmadi:', videoPath);
        // }
        try {
          // const videoPath = './update.mp4';
          await bot.telegram.sendMessage(currentUser.telegramId, messageTemplate, {parse_mode: 'MarkdownV2'});
          // await bot.telegram.sendVideo(
          //   currentUser.telegramId,
          //   { source: videoPath }, // local fayl
          //   { caption: messageTemplate } // video bilan birga matn
          // );

          stats.sent++;
        } catch (err) {
          if (err.code === 403 && err.response.description.includes('user is deactivated')) {
            stats.userDeactivatedBot++;
          } else if (
            err.code === 403 &&
            err.response.description.includes('bot was blocked by the user')
          ) {
            stats.userBlockedBot++;
          } else {
            stats.chatNotFound++;
          }
          // console.log(err)
        }
      })
    );

    console.log(`⏳ Batch ${i / batchSize + 1} yakunlandi. 1 daqiqa kutamiz...`);
    await sleep(30000);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const send = async () => {
  // const userIds = await getInactiveBotUserIds();
  // const userIds = [36];
  // const userIds = [36, 52248, 35269, 55194, 13750, 1663, 5257, 91892, 44990, 47852, 81587];
  const userIds = await getActiveUserIds();
  userIds.unshift(36);
  console.log('user.length', userIds.length);
  await sendUpdateMessage(1200, userIds);
};

// send()
//   .then(() => {
//     console.log('✅ Barcha xabarlar yuborildi.');
//     process.exit(0);
//   })
//   .catch(err => {
//     console.error('Xabarlarni yuborishda xatolik yuz berdi:', err);
//     process.exit(1);
//   });

(async () => {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: expoPushToken,
      title: "Hello",
      body: "New message",
      data: { screen: "index", id: "123" },
      channelId: "default", // Android
      sound: "default"
    })
  });
})()