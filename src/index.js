import dotenv from 'dotenv';
import { dbInit } from './database.js';
import { initBot } from './bot.js';
import { initScheduler } from './scheduler.js';
import { initServer } from './server.js';

// Load environment variables
dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatId = process.env.ALLOWED_CHAT_ID;

if (!token || token === 'YOUR_TELEGRAM_BOT_TOKEN_HERE') {
  console.error('\n❌ KLAIDA: Nerastas TELEGRAM_BOT_TOKEN!');
  console.error('Prašome sukurti arba redaguoti .env failą ir įvesti tikrą BotToken iš @BotFather.\n');
  process.exit(1);
}

console.log('🤖 Paleidžiamas KASDIENIS CRYPTOSNIPERIS (#DS) botas...');

try {
  // 1. Initialize SQLite Database
  dbInit();
  console.log('📂 SQLite duomenų bazė paruošta.');

  // 2. Initialize Telegram Bot
  const bot = initBot(token);

  // 3. Initialize background Scheduler
  initScheduler(bot);

  // 4. Initialize Express Web Server for the Dashboard
  initServer();

  // 5. Start polling
  bot.launch()
    .then(() => {
      console.log('\n==================================================');
      console.log('🚀 Telegram botas sėkmingai paleistas ir veikia!');
      console.log(`📡 Laukiama žinučių...`);
      if (allowedChatId) {
        console.log(`🔒 Apribota tik pokalbio ID: ${allowedChatId}`);
      } else {
        console.log(`🔓 Veikia visose grupėse (ID apribojimas neįvestas).`);
        console.log(`💡 Norėdami gauti savo grupės ID, įrašykite /chatid grupėje!`);
      }
      console.log('==================================================\n');
    })
    .catch((err) => {
      console.error('❌ Nepavyko paleisti Telegram boto:', err);
      process.exit(1);
    });

  // Enable graceful stop
  process.once('SIGINT', () => {
    console.log('\n🛑 Stabdomas botas (SIGINT)...');
    bot.stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    console.log('\n🛑 Stabdomas botas (SIGTERM)...');
    bot.stop('SIGTERM');
  });

} catch (error) {
  console.error('❌ Kritinė paleidimo klaida:', error);
  process.exit(1);
}
