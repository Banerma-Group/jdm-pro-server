require('dotenv').config(); // Load environment variables from .env file
const { Telegraf } = require('telegraf');
const { User } = require('../db/models');

// Initialize the bot with your token from environment variables
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// List of user IDs to check
const userIds = [];

// Function to check user activity
async function checkUserActivity() {
  for (const userId of userIds) {
    try {
      // Attempt to send a 'typing' action to check if the user is still active
      await bot.telegram.sendChatAction(userId, 'typing');
      console.log(`User ${userId} is still active.`);
    } catch (error) {
      if (error.response && error.response.error_code === 403) {
        // User has blocked the bot
        console.log(`User ${userId} has blocked the bot.`);
        try {
          await User.destroy({
            where: {
              telegram_id: userId,
            },
          });
        } catch (e) {
          console.error(e);
        }
      } else {
        // Other errors (e.g., network issues)
        console.error(`Error checking user ${userId}:`, error.message);
      }
    }
  }
}

// Call the function to check user activity
checkUserActivity()
  .then(() => {
    console.log('User activity check completed.');
    process.exit(); // Exit the script once the check is done
  })
  .catch(error => {
    console.error('Error during user activity check:', error.message);
    process.exit(1); // Exit with an error code if something goes wrong
  });
