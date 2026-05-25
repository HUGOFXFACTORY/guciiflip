import { Telegraf } from 'telegraf';
import dotenv from 'dotenv';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;

async function testConnection() {
  console.log('Testing Telegram connection...');
  console.log('Token starts with:', token ? token.substring(0, 10) + '...' : 'undefined');

  try {
    const bot = new Telegraf(token);
    console.log('Calling getMe()...');
    const me = await bot.telegram.getMe();
    console.log('Success! Bot details:');
    console.log(JSON.stringify(me, null, 2));
  } catch (error) {
    console.error('Error connecting to Telegram API:', error);
  }
}

testConnection();
