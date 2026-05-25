import { getDailyCandle } from './bybit.js';

async function test() {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const targetDate = yesterday.toISOString().split('T')[0];
  
  console.log(`Fetching daily candle for yesterday: ${targetDate}...`);
  try {
    const candle = await getDailyCandle(targetDate);
    console.log('Result:', candle);
  } catch (err) {
    console.error('Test failed:', err);
  }
}

test();
