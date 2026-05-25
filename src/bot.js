import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import { 
  upsertUser, 
  upsertPrediction, 
  getUserPrediction, 
  getLeaderboard 
} from './database.js';

dotenv.config();

const ALLOWED_CHAT_ID = process.env.ALLOWED_CHAT_ID;

/**
 * Checks if the message originates from the allowed group chat
 * @param {import('telegraf').Context} ctx 
 * @returns {boolean}
 */
function isChatAllowed(ctx) {
  if (!ALLOWED_CHAT_ID) {
    return true; // If not configured, allow any chat (useful for initial setup)
  }
  return String(ctx.chat.id) === String(ALLOWED_CHAT_ID);
}

/**
 * Initializes and registers handlers for the Telegram Bot
 * @param {string} token 
 * @returns {Telegraf}
 */
export function initBot(token) {
  const bot = new Telegraf(token);

  // Helper command to find Group Chat ID
  bot.command('chatid', (ctx) => {
    ctx.reply(`Šio pokalbio ID yra: \`${ctx.chat.id}\``, { parse_mode: 'Markdown' });
  });

  // Hashtag #ds trigger
  bot.hears(/#ds/i, async (ctx) => {
    try {
      console.log(`[Bot] Message with #ds in chat "${ctx.chat.title || 'Private'}" (ID: ${ctx.chat.id}) from ${ctx.from.username || ctx.from.first_name}`);
      
      if (!isChatAllowed(ctx)) {
        console.warn(`[Bot] Ignored hashtag from unauthorized chat ID: ${ctx.chat.id}`);
        return;
      }

      // Upsert/register user
      upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name);

      // Compute target date (tomorrow in UTC)
      const tomorrow = new Date();
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const targetDate = tomorrow.toISOString().split('T')[0];

      // Check if user already predicted
      const existing = getUserPrediction(ctx.from.id, targetDate);
      let promptText = `🟥↘️ **KASDIENIS CRYPTOSNIPERIS #DS** 🟩↗️\n\n`;
      promptText += `Spėk kitos dienos (**${targetDate}**) Bitcoin (BTC) uždarymo žvakę SPOT rinkoje!\n`;
      promptText += `Balsavimas baigiasi: **${targetDate} 00:00 UTC**.\n\n`;
      
      if (existing) {
        promptText += `🔄 Tavo dabartinis spėjimas: ${existing.prediction === 'UP' ? '🟩 **ŽALIA (UP)** ↗️' : '🟥 **RAUDONA (DOWN)** ↘️'}\n`;
        promptText += `_Norėdamas pakeisti, spausk žemiau esančius mygtukus:_`;
      } else {
        promptText += `Pasirink žvakės kryptį spausdamas mygtukus žemiau:`;
      }

      const inlineKeyboard = Markup.inlineKeyboard([
        Markup.button.callback('🟩 ŽALIA (UP) ↗️', `predict_UP_${targetDate}`),
        Markup.button.callback('🟥 RAUDONA (DOWN) ↘️', `predict_DOWN_${targetDate}`)
      ]);

      await ctx.reply(promptText, {
        parse_mode: 'Markdown',
        reply_to_message_id: ctx.message.message_id,
        ...inlineKeyboard
      });

    } catch (error) {
      console.error('[Bot] Error handling #ds message:', error);
    }
  });

  // Callback query handler for predictions
  bot.action(/^predict_(UP|DOWN)_(.+)$/, async (ctx) => {
    try {
      const direction = ctx.match[1];
      const targetDate = ctx.match[2];
      const userId = ctx.from.id;

      // Log action
      console.log(`[Bot] Action from ${ctx.from.username || ctx.from.first_name}: ${direction} for date ${targetDate}`);

      // Verify voting deadline (must be before targetDate 00:00 UTC)
      const now = new Date();
      const deadline = new Date(`${targetDate}T00:00:00Z`);

      if (now >= deadline) {
        await ctx.answerCbQuery('⚠️ Balsavimas šiai dienai jau uždarytas!', { show_alert: true });
        
        // Remove buttons since voting is closed
        await ctx.editMessageText(`🎯 **KASDIENIS CRYPTOSNIPERIS #DS**\n\nBalsavimas dienai **${targetDate}** jau pasibaigęs! Spėjimai nepriimami.`);
        return;
      }

      // Upsert User and Prediction in DB
      upsertUser(userId, ctx.from.username, ctx.from.first_name);
      upsertPrediction(userId, targetDate, direction);

      // Confirm to user via callback alert
      const directionEmoji = direction === 'UP' ? '🟩 Žalia (UP) ↗️' : '🟥 Raudona (DOWN) ↘️';
      await ctx.answerCbQuery(`✅ Prognozė išsaugota: ${direction === 'UP' ? 'Green 🟩' : 'Red 🟥'}!`);

      // Update message to confirm selection
      const name = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;
      
      let confirmationText = `🎯 **KASDIENIS CRYPTOSNIPERIS #DS**\n\n`;
      confirmationText += `Snaiperis ${name} pateikė prognozę **${targetDate}** dienai:\n`;
      confirmationText += `👉 ${directionEmoji}\n\n`;
      
      const nowString = new Date().toISOString().replace('T', ' ').substring(0, 19);
      confirmationText += `_Pateikta: ${nowString} UTC_\n`;
      confirmationText += `_(Jei norite pakeisti prognozę, parašykite #ds pokalbyje dar kartą)_`;

      await ctx.editMessageText(confirmationText, {
        parse_mode: 'Markdown'
      });

    } catch (error) {
      console.error('[Bot] Error handling callback action:', error);
      try {
        await ctx.answerCbQuery('❌ Įvyko klaida saugant prognozę.');
      } catch (cbErr) {
        // Ignore if callback query was already answered or expired
      }
    }
  });

  // On-demand leaderboard command
  bot.command('leaderboard', async (ctx) => {
    try {
      if (!isChatAllowed(ctx)) return;

      const weeklyBoard = getLeaderboard('weekly', 5);
      const monthlyBoard = getLeaderboard('monthly', 5);
      const allTimeBoard = getLeaderboard('all_time', 5);

      let leaderboardMsg = `🏆 **LYDERIŲ LENTELĖS** 🏆\n\n`;

      leaderboardMsg += `📅 **Savaitės lyderiai:**\n`;
      if (weeklyBoard.length > 0) {
        weeklyBoard.forEach((u, index) => {
          const name = u.username ? `@${u.username}` : u.first_name || `ID: ${u.user_id}`;
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
          leaderboardMsg += `${medal} ${name}: \`${u.score}\` tašk.\n`;
        });
      } else {
        leaderboardMsg += `• _Nėra duomenų_\n`;
      }

      leaderboardMsg += `\n📅 **Mėnesio lyderiai:**\n`;
      if (monthlyBoard.length > 0) {
        monthlyBoard.forEach((u, index) => {
          const name = u.username ? `@${u.username}` : u.first_name || `ID: ${u.user_id}`;
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
          leaderboardMsg += `${medal} ${name}: \`${u.score}\` tašk.\n`;
        });
      } else {
        leaderboardMsg += `• _Nėra duomenų_\n`;
      }

      leaderboardMsg += `\n👑 **Visų laikų geriausi:**\n`;
      if (allTimeBoard.length > 0) {
        allTimeBoard.forEach((u, index) => {
          const name = u.username ? `@${u.username}` : u.first_name || `ID: ${u.user_id}`;
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '•';
          leaderboardMsg += `${medal} ${name}: \`${u.score}\` tašk.\n`;
        });
      } else {
        leaderboardMsg += `• _Nėra duomenų_\n`;
      }

      await ctx.reply(leaderboardMsg, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('[Bot] Error handling /leaderboard command:', error);
    }
  });

  return bot;
}
