import cron from 'node-cron';
import { getDailyCandle } from './bybit.js';
import { 
  dbInit, 
  upsertCandle, 
  getCandle, 
  getPredictionsForDate, 
  awardPoint, 
  getLeaderboard, 
  resetLeaderboard 
} from './database.js';

// Configuration
const ALLOWED_CHAT_ID = process.env.ALLOWED_CHAT_ID;

/**
 * Main evaluation routine for a specific target date
 * @param {import('telegraf').Telegraf} bot - Telegraf bot instance
 * @param {string} targetDate - Format YYYY-MM-DD
 */
export async function evaluateDate(bot, targetDate) {
  console.log(`[Scheduler] Starting evaluation for target date: ${targetDate}`);
  
  try {
    // 1. Check if already evaluated in database
    const cachedCandle = getCandle(targetDate);
    if (cachedCandle && cachedCandle.evaluated === 1) {
      console.log(`[Scheduler] Date ${targetDate} is already evaluated.`);
      return;
    }

    // 2. Fetch candle data from Bybit
    const candle = await getDailyCandle(targetDate);
    if (!candle) {
      console.error(`[Scheduler] Could not fetch candle data for ${targetDate}. Retrying later.`);
      return;
    }

    const { openPrice, closePrice, color } = candle;
    console.log(`[Scheduler] Fetch result for ${targetDate}: Open=${openPrice}, Close=${closePrice}, Color=${color}`);

    // Save candle metadata as evaluated
    upsertCandle(targetDate, openPrice, closePrice, color, 1);

    // 3. Fetch predictions for this target date
    const predictions = getPredictionsForDate(targetDate);
    
    const correctSnipers = [];
    const incorrectSnipers = [];

    for (const p of predictions) {
      const userMention = p.username ? `@${p.username}` : p.first_name || `ID: ${p.user_id}`;
      const isCorrect = (p.prediction === 'UP' && color === 'GREEN') || 
                        (p.prediction === 'DOWN' && color === 'RED');

      if (isCorrect) {
        awardPoint(p.user_id);
        correctSnipers.push({ mention: userMention, choice: p.prediction });
      } else {
        incorrectSnipers.push({ mention: userMention, choice: p.prediction });
      }
    }

    // 4. Format and post the Daily Result Announcement
    let resultMessage = `🟥↘️ **KASDIENIS CRYPTOSNIPERIS #DS** 🟩↗️\n`;
    resultMessage += `📅 **Užsidariusi žvakė:** \`${targetDate}\` (SPOT)\n\n`;
    resultMessage += `📊 **Bybit Rinkos Rezultatai:**\n`;
    resultMessage += `• Atidarymas (Open): \`${openPrice.toFixed(2)}\` USDT\n`;
    resultMessage += `• Uždarymas (Close): \`${closePrice.toFixed(2)}\` USDT\n`;
    
    if (color === 'GREEN') {
      resultMessage += `• Žvakės kryptis: 🟩 **ŽALIA (UP)** ↗️\n\n`;
    } else if (color === 'RED') {
      resultMessage += `• Žvakės kryptis: 🟥 **RAUDONA (DOWN)** ↘️\n\n`;
    } else {
      resultMessage += `• Žvakės kryptis: ⚪ **FLAT** (Kainos nesikeitė)\n\n`;
    }

    resultMessage += `🎯 **Taiklūs dienos snaiperiai (+1 taškas):**\n`;
    if (correctSnipers.length > 0) {
      correctSnipers.forEach(s => {
        resultMessage += `• ${s.mention} (${s.choice === 'UP' ? '🟩' : '🟥'})\n`;
      });
    } else {
      resultMessage += `• _Šiandien taiklių snaiperių nebuvo._\n`;
    }

    resultMessage += `\n❌ **Nepataikę spėjimai:**\n`;
    if (incorrectSnipers.length > 0) {
      incorrectSnipers.forEach(s => {
        resultMessage += `• ${s.mention} (${s.choice === 'UP' ? '🟩' : '🟥'})\n`;
      });
    } else {
      resultMessage += `• _Visi spėjimai buvo taiklūs arba spėjimų nebuvo._\n`;
    }

    // Broadcast results to group
    if (ALLOWED_CHAT_ID) {
      await bot.telegram.sendMessage(ALLOWED_CHAT_ID, resultMessage, { parse_mode: 'Markdown' });
    } else {
      console.log('[Scheduler] ALLOWED_CHAT_ID is not configured. Result message printed below:');
      console.log(resultMessage);
    }

    // 5. Handle Turn Leaderboards & Resets
    await postLeaderboardsAndCheckResets(bot);

  } catch (error) {
    console.error(`[Scheduler] Error in evaluateDate for ${targetDate}:`, error);
  }
}

/**
 * Handles weekly and monthly leaderboards, crowns champions, and resets scores.
 * Runs directly after daily evaluation.
 * @param {import('telegraf').Telegraf} bot 
 */
async function postLeaderboardsAndCheckResets(bot) {
  const today = new Date();
  
  // Weekly Reset: Sunday candle closes on Monday 00:00 UTC, evaluated on Monday morning.
  // Today is Monday (getUTCDay() === 1)
  const isWeeklyResetDay = today.getUTCDay() === 1;
  
  // Monthly Reset: Last day of month closes on 1st of next month, evaluated on 1st of month.
  // Today is the 1st (getUTCDate() === 1)
  const isMonthlyResetDay = today.getUTCDate() === 1;

  // Fetch leaderboards
  const weeklyBoard = getLeaderboard('weekly', 5);
  const monthlyBoard = getLeaderboard('monthly', 5);
  const allTimeBoard = getLeaderboard('all_time', 5);

  let leaderboardMsg = `🏆 **LYDERIŲ LENTELĖS** 🏆\n\n`;

  // Weekly Section
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

  // Monthly Section
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

  // All-time Section
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

  // Broadcast leaderboards
  if (ALLOWED_CHAT_ID) {
    await bot.telegram.sendMessage(ALLOWED_CHAT_ID, leaderboardMsg, { parse_mode: 'Markdown' });
  } else {
    console.log('[Scheduler] Leaderboard printed below:');
    console.log(leaderboardMsg);
  }

  // Trigger Weekly Champion Announcement & Reset
  if (isWeeklyResetDay && weeklyBoard.length > 0) {
    const champ = weeklyBoard[0];
    const champName = champ.username ? `@${champ.username}` : champ.first_name || `ID: ${champ.user_id}`;
    const champMsg = `🎉👑 **SAVAITĖS ČEMPIONAS!** 👑🎉\n\nSveikiname ${champName}! Šią savaitę tu buvai taikliausias Crypto Sniperis su \`${champ.score}\` teisingais spėjimais! 🔥\n\n_Savaitiniai taškai dabar anuliuojami ir pradedama nauja kova! Sėkmės!_`;
    
    if (ALLOWED_CHAT_ID) {
      await bot.telegram.sendMessage(ALLOWED_CHAT_ID, champMsg, { parse_mode: 'Markdown' });
    } else {
      console.log(champMsg);
    }

    resetLeaderboard('weekly');
    console.log('[Scheduler] Weekly leaderboard has been reset.');
  }

  // Trigger Monthly Champion Announcement & Reset
  if (isMonthlyResetDay && monthlyBoard.length > 0) {
    const champ = monthlyBoard[0];
    const champName = champ.username ? `@${champ.username}` : champ.first_name || `ID: ${champ.user_id}`;
    const champMsg = `👑🏆 **MĖNESIO SUPER SNIPERIS!** 🏆👑\n\nSveikiname ${champName}! Šį mėnesį parodei įspūdingą taiklumą ir surinkai \`${champ.score}\` taškus! Tu oficialiai esi šio mėnesio karalius! 🎯💪\n\n_Mėnesio taškai anuliuojami naujam ciklui!_`;
    
    if (ALLOWED_CHAT_ID) {
      await bot.telegram.sendMessage(ALLOWED_CHAT_ID, champMsg, { parse_mode: 'Markdown' });
    } else {
      console.log(champMsg);
    }

    resetLeaderboard('monthly');
    console.log('[Scheduler] Monthly leaderboard has been reset.');
  }
}

/**
 * Initializes the background scheduler to run everyday at 00:01 UTC
 * @param {import('telegraf').Telegraf} bot 
 */
export function initScheduler(bot) {
  // Cron syntax: Minute=1 Hour=0 (00:01 UTC)
  // Options: timezone='UTC' to prevent any server timezone mismatches.
  cron.schedule('1 0 * * *', async () => {
    console.log('[Scheduler] Triggering UTC daily 00:01 evaluation...');
    
    // Target date is yesterday (Day D+1 candle just closed at Day D+2 00:00 UTC)
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const targetDate = yesterday.toISOString().split('T')[0];

    await evaluateDate(bot, targetDate);
  }, {
    timezone: 'UTC'
  });

  console.log('[Scheduler] Daily 00:01 UTC evaluation scheduler loaded.');
}
