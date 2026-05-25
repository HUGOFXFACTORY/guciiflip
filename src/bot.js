import { Telegraf, Markup } from 'telegraf';
import dotenv from 'dotenv';
import {
  upsertUser,
  upsertPrediction,
  getUserPrediction,
  getLeaderboard
} from './database.js';

dotenv.config();

const ALLOWED_CHAT_ID = process.env.ALLOWED_CHAT_ID ? process.env.ALLOWED_CHAT_ID.replace(/['"/g, '') : undefined;

function isChatAllowed(ctx) {
  if (!ALLOWED_CHAT_ID) {
    return true;
  }
  return ctx.chat.type === 'private' || String(ctx.chat.id) === String(ALLOWED_CHAT_ID);
}

/**
 * Standard prediction prompt generator used by both /predict command and #ds hashtag.
 */
async function triggerPredictionPrompt(ctx) {
  try {
    console.log(`[Bot] Prediction prompt triggered in chat "${ctx.chat.title || 'Private'}" (ID: ${ctx.chat.id}) from ${ctx.from.username || ctx.from.first_name}`);

    if (!isChatAllowed(ctx)) {
      console.warn(`[Bot] Ignored hashtag/command from unauthorized chat ID: ${ctx.chat.id}`);
      return;
    }

    upsertUser(ctx.from.id, ctx.from.username, ctx.from.first_name);

    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const targetDate = tomorrow.toISOString().split('T')[0];

    const existing = getUserPrediction(ctx.from.id, targetDate);
    let promptText = `<b>KASDIENIS CRYPTOSNIPERIS #DS</b>\n\n`;
    promptText += `Spek kitos dienos (<b>${targetDate}</b>) Bitcoin (BTC) uzdarymo zvake SPOT rinkoje!\n`;
    promptText += `Balsavimas baigiasi: <b>${targetDate} 00:00 UTC</b>\n`;

    if (existing) {
      promptText += `\nTavo dabartinis spejimas: ${existing.prediction === 'UP' ? 'ZALIA (UP)' : 'RAUDONA (DOWN)'}\n`;
      promptText += `_Noredami pakeisti, spausk zemiau esancius mygtukus:_\n`;
    } else {
      promptText += `\nPasirink zvakes krypti spausdamas mygtukus zemiau:`;
    }

    const inlineKeyboard = Markup.inlineKeyboard([
      Markup.button.callback('ZALIA (UP)', `predict_UP_${targetDate}`),
      Markup.button.callback('RAUDONA (DOWN)', `predict_DOWN_${targetDate}`)
    ]);

    await ctx.reply(promptText, {
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message ? ctx.message.message_id : undefined,
      ...inlineKeyboard
    });
  } catch (error) {
    console.error('[Bot] Error handling prediction prompt:', error);
  }
}

/**
 * Initializes and registers handlers for the Telegram Bot
 */
export function initBot(token) {
  const bot = new Telegraf(token);

  // Set Telegram command menu
  bot.telegram.setMyCommands([
    { command: 'start', description: 'Pradeti ir gauti pagalba' },
    { command: 'help', description: 'Zaidimo taisykles ir komandos' },
    { command: 'predict', description: 'Atlikti prognozę kitai dienai (#ds)' },
    { command: 'leaderboard', description: 'Rodyti lyderiu lentele' },
    { command: 'dashboard', description: 'Atidaryti rezultatu svieslenте' },
    { command: 'chatid', description: 'Gauti sio pokalbio ID' }
  ]).catch(err => console.error('[Bot] Nepavyko nustatyti komandu meniu:', err));

  // /start and /help command handler
  bot.command(['start', 'help'], async (ctx) => {
    if (!isChatAllowed(ctx)) return;

    let welcomeMsg = `<b>Sveiki atvyke i KASDIENIS CRYPTOSNIPERIS (#DS)!</b>\n\n`;
    welcomeMsg += `Sis botas leidzia prognozuoti Bitcoin (BTC) dienos uzdarymo zvakes krypti (Zalia / Raudona) ir varzytis su kitais pokalbio dalyviais!\n\n`;
    welcomeMsg += `<b>Zaidimo taisykles:</b>\n`;
    welcomeMsg += `1. Kiekviena diena spekite kitos dienos zvakes uzdarymo krypti.\n`;
    welcomeMsg += `2. Spejimai priimami iki tos dienos 00:00 UTC.\n`;
    welcomeMsg += `3. Teisingas spejimas suteikia +1 taška savaitei, menesio ir visu laiku lyderiu lentelese.\n`;
    welcomeMsg += `4. Pirmadieniais anuliuojami savaitės taskai ir skelbiamas savaitės nugaletojas.\n`;
    welcomeMsg += `5. Kiekvieno mėnesio 1-ają diena anuliuojami mėnesio taskai.\n\n`;
    welcomeMsg += `<b>Galimos komandos:</b>\n`;
    welcomeMsg += `* Parasykite <b>#ds</b> arba <code>/predict</code> - atlikti prognozę.\n`;
    welcomeMsg += `* <code>/leaderboard</code> - perizureti lyderiu lentele tiesiiai pokalbyjе.\n`;
    welcomeMsg += `* <code>/dashboard</code> - gauti nuoroda i vizualia rezultatu svieslenте (dashboard).\n`;
    welcomeMsg += `* <code>/chatid</code> - parodyti sio pokalbio ID.\n\n`;
    welcomeMsg += `Sekminго snaiperinio!`;

    await ctx.reply(welcomeMsg, { parse_mode: 'HTML' });
  });

  // /predict command handler
  bot.command('predict', triggerPredictionPrompt);

  // Hashtag #ds trigger
  bot.hears(/#ds/i, triggerPredictionPrompt);

  // /dashboard command handler
  bot.command('dashboard', async (ctx) => {
    if (!isChatAllowed(ctx)) return;

    const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
    let msg = `<b>KASDIENIS CRYPTOSNIPERIS #DS SVIESLENТЕ</b>\n\n`;
    msg += `Cia galite stebeti pilna dalyviu statistika, lyderiu lenteles, spejimo tiksluma bei istorija:\n`;
    msg += `<a href="${dashboardUrl}">Atidaryti Svieslenте</a>\n\n`;
    msg += `<i>Jei puslapis nepasiekiamas, isitikinkite, kad serveris veikia ir DASHBOARD_URL kintamasis yra sukonfiguruotas teisingai.</i>`;

    await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // Helper command to find Group Chat ID
  bot.command('chatid', (ctx) => {
    ctx.reply(`Sio pokalbio ID yra: <code>${ctx.chat.id}</code>`, { parse_mode: 'HTML' });
  });

  // Callback query handler for predictions
  bot.action(/^predict_(UP|DOWN)_(.+)$/, async (ctx) => {
    try {
      const direction = ctx.match[1];
      const targetDate = ctx.match[2];
      const userId = ctx.from.id;

      console.log(`[Bot] Action from ${ctx.from.username || ctx.from.first_name}: ${direction} for date ${targetDate}`);

      const now = new Date();
      const deadline = new Date(`${targetDate}T00:00:00Z`);

      if (now >= deadline) {
        await ctx.answerCbQuery('Balsavimas siai dienai jau uzdarytas!', { show_alert: true });
        await ctx.editMessageText(`<b>KASDIENIS CRYPTOSNIPERIS #DS</b>\n\nBalsavimas dienai <b>${targetDate}</b> jau pasibaiges! Spejimai nepriimami.`, { parse_mode: 'HTML' });
        return;
      }

      upsertUser(userId, ctx.from.username, ctx.from.first_name);
      upsertPrediction(userId, targetDate, direction);

      const directionEmoji = direction === 'UP' ? 'ZALIA (UP)' : 'RAUDONA (DOWN)';
      await ctx.answerCbQuery(`Prognoze issaugota: ${direction === 'UP' ? 'Green' : 'Red'}!`);

      const name = ctx.from.username ? `@${ctx.from.username}` : ctx.from.first_name;

      let confirmationText = `<b>KASDIENIS CRYPTOSNIPERIS #DS</b>\n`;
      confirmationText += `Snаiperis ${name} pateike prognozе <b>${targetDate}</b> dienai:\n`;
      confirmationText += `${directionEmoji}\n`;

      const nowString = new Date().toISOString().replace('T', ' ').substring(0, 19);
      confirmationText += `Pateikta: ${nowString} UTC\n`;
      confirmationText += `<i>(Jei norite pakeisti prognozе, parasykite #ds arba /predict is naujo)</i>`;

      await ctx.editMessageText(confirmationText, {
        parse_mode: 'HTML'
      });

    } catch (error) {
      console.error('[Bot] Error handling callback action:', error);
      try {
        await ctx.answerCbQuery('Ivyko klaida saugant prognozе.');
      } catch (cbErr) {
        // Ignore if callback query was already answered or expired
      }
    }
  });

  // On-demand leaderboard command
  bot.command('leaderboard', async (ctx) => {
    try {
      if (!isChatAllowed(ctx)) return;

      const leaders = getLeaderboard(10);
      const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';

      if (leaders.length === 0) {
        await ctx.reply('Lyderiu lentele dar tuscia. Buk pirmas ir pateik prognozе su #ds!', { parse_mode: 'HTML' });
        return;
      }

      let leaderboardMsg = `<b>KASDIENIS CRYPTOSNIPERIS #DS - Lyderiu Lentele</b>\n\n`;

      leaders.forEach((user, index) => {
        const medal = index === 0 ? '' : index === 1 ? '' : index === 2 ? '' : `${index + 1}.`;
        const username = user.username ? `@${user.username}` : user.first_name;
        leaderboardMsg += `${medal} ${username}\n`;
        leaderboardMsg += `   Visi laikai: <b>${user.score_all_time}</b> | Menuo: <b>${user.score_monthly}</b> | Savaite: <b>${user.score_weekly}</b>\n\n`;
      });

      leaderboardMsg += `<a href="${dashboardUrl}">Pilna statistika ir istorija</a>`;

      await ctx.reply(leaderboardMsg, { parse_mode: 'HTML' });
    } catch (error) {
      console.error('[Bot] Error fetching leaderboard:', error);
      await ctx.reply('Ivyko klaida gaunant lyderiu lentele.', { parse_mode: 'HTML' });
    }
  });

  return bot;
}
