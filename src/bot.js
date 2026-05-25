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
 * Standard prediction prompt generator used by both /predict command and #ds hashtag.
 * @param {import('telegraf').Context} ctx 
 */
async function triggerPredictionPrompt(ctx) {
  try {
    console.log(`[Bot] Prediction prompt triggered in chat "${ctx.chat.title || 'Private'}" (ID: ${ctx.chat.id}) from ${ctx.from.username || ctx.from.first_name}`);
    
    if (!isChatAllowed(ctx)) {
      console.warn(`[Bot] Ignored hashtag/command from unauthorized chat ID: ${ctx.chat.id}`);
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
      reply_to_message_id: ctx.message ? ctx.message.message_id : undefined,
      ...inlineKeyboard
    });

  } catch (error) {
    console.error('[Bot] Error handling prediction prompt:', error);
  }
}

/**
 * Initializes and registers handlers for the Telegram Bot
 * @param {string} token 
 * @returns {Telegraf}
 */
export function initBot(token) {
  const bot = new Telegraf(token);

  // Set Telegram command menu
  bot.telegram.setMyCommands([
    { command: 'start', description: 'Pradėti ir gauti pagalbą' },
    { command: 'help', description: 'Žaidimo taisyklės ir komandos' },
    { command: 'predict', description: 'Atlikti prognozę kitai dienai (#ds)' },
    { command: 'leaderboard', description: 'Rodyti lyderių lentelę' },
    { command: 'dashboard', description: 'Atidaryti rezultatų švieslentę' },
    { command: 'chatid', description: 'Gauti šio pokalbio ID' }
  ]).catch(err => console.error('[Bot] Nepavyko nustatyti komandų meniu:', err));

  // /start and /help command handler
  bot.command(['start', 'help'], async (ctx) => {
    if (!isChatAllowed(ctx)) return;

    let welcomeMsg = `🤖 **Sveiki atvykę į KASDIENĮ CRYPTOSNIPERĮ (#DS)!** 🎯\n\n`;
    welcomeMsg += `Šis botas leidžia prognozuoti Bitcoin (BTC) dienos uždarymo žvakės kryptį (Žalia 🟩 / Raudona 🟥) ir varžytis su kitais pokalbio dalyviais!\n\n`;
    welcomeMsg += `🚀 **Žaidimo taisyklės:**\n`;
    welcomeMsg += `1️⃣ Kiekvieną dieną spėkite kitos dienos žvakės uždarymo kryptį.\n`;
    welcomeMsg += `2️⃣ Spėjimai priimami iki tos dienos **00:00 UTC**.\n`;
    welcomeMsg += `3️⃣ Teisingas spėjimas suteikia **+1 tašką** savaitės, mėnesio ir visų laikų lyderių lentelėse.\n`;
    welcomeMsg += `4️⃣ Pirmadieniais anuliuojami savaitės taškai ir skelbiamas savaitės nugalėtojas.\n`;
    welcomeMsg += `5️⃣ Kiekvieno mėnesio 1-ąją dieną anuliuojami mėnesio taškai.\n\n`;
    welcomeMsg += `🎯 **Galimos komandos:**\n`;
    welcomeMsg += `• Parašykite pokalbyje **#ds** arba `/predict` – atlikti prognozę.\n`;
    welcomeMsg += `• `/leaderboard` – peržiūrėti lyderių lentelę tiesiai pokalbyje.\n`;
    welcomeMsg += `• `/dashboard` – gauti nuorodą į vizualią rezultatų švieslentę (dashboard).\n`;
    welcomeMsg += `• `/chatid` – parodyti šio pokalbio ID.\n\n`;
    welcomeMsg += `Sėkmingo snaiperinimo! 🎯💪`;

    await ctx.reply(welcomeMsg, { parse_mode: 'Markdown' });
  });

  // /predict command handler
  bot.command('predict', triggerPredictionPrompt);

  // Hashtag #ds trigger
  bot.hears(/#ds/i, triggerPredictionPrompt);

  // /dashboard command handler
  bot.command('dashboard', async (ctx) => {
    if (!isChatAllowed(ctx)) return;

    const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
    let msg = `📊 **KASDIENIS CRYPTOSNIPERIS #DS ŠVIESLENTĖ**\n\n`;
    msg += `Čia galite stebėti pilną dalyvių statistiką, lyderių lenteles, spėjimų tikslumą bei istoriją:\n`;
    msg += `🔗 [Atidaryti Švieslentę](${dashboardUrl})\n\n`;
    msg += `_Jei puslapis nepasiekiamas, įsitikinkite, kad serveris veikia ir DASHBOARD_URL kintamasis yra sukonfigūruotas teisingai._`;

    await ctx.reply(msg, { parse_mode: 'Markdown' });
  });

  // Helper command to find Group Chat ID
  bot.command('chatid', (ctx) => {
    ctx.reply(`Šio pokalbio ID yra: \`${ctx.chat.id}\``, { parse_mode: 'Markdown' });
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
      confirmationText += `_(Jei norite pakeisti prognozę, parašykite #ds arba /predict iš naujo)_`;

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

      // Add link to full web dashboard at the bottom
      const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
      leaderboardMsg += `\n📊 **Pilna dalyvių švieslentė ir istorija:**\n🔗 ${dashboardUrl}\n`;

      await ctx.reply(leaderboardMsg, { parse_mode: 'Markdown' });

    } catch (error) {
      console.error('[Bot] Error handling /leaderboard command:', error);
    }
  });

  return bot;
}
