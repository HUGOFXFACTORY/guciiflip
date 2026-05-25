import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BYBIT_API_URL = process.env.BYBIT_API_URL || 'https://api.bybit.com';

/**
 * Converts a Unix timestamp in milliseconds to a UTC YYYY-MM-DD date string.
 * @param {number|string} timestampMs 
 * @returns {string}
 */
export function timestampToUTCDateString(timestampMs) {
  const date = new Date(Number(timestampMs));
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Fetches BTCUSDT Spot daily candles from Bybit and finds the one matching targetDate.
 * Bybit V5 returns candles in descending order (index 0 is current open candle, index 1 is yesterday's closed candle, etc.)
 * @param {string} targetDate - Format: YYYY-MM-DD
 * @returns {Promise<{candleDate: string, openPrice: number, closePrice: number, color: 'GREEN'|'RED'|'FLAT'}|null>}
 */
export async function getDailyCandle(targetDate) {
  try {
    const url = `${BYBIT_API_URL}/v5/market/kline`;
    const response = await axios.get(url, {
      params: {
        category: 'spot',
        symbol: 'BTCUSDT',
        interval: 'D',
        limit: 5 // Fetch last 5 candles to cover timezones/delays safely
      }
    });

    if (response.data?.retCode !== 0) {
      throw new Error(`Bybit API Error: ${response.data?.retMsg || 'Unknown error'}`);
    }

    const list = response.data?.result?.list;
    if (!Array.isArray(list) || list.length === 0) {
      throw new Error('Bybit API returned empty candle list');
    }

    // Bybit list structure: [startTime, openPrice, highPrice, lowPrice, closePrice, volume, turnover]
    for (const item of list) {
      const startTime = item[0];
      const candleDate = timestampToUTCDateString(startTime);

      if (candleDate === targetDate) {
        const openPrice = parseFloat(item[1]);
        const closePrice = parseFloat(item[4]);
        
        let color = 'FLAT';
        if (closePrice > openPrice) {
          color = 'GREEN';
        } else if (closePrice < openPrice) {
          color = 'RED';
        }

        return {
          candleDate,
          openPrice,
          closePrice,
          color
        };
      }
    }

    console.warn(`Candle for target date ${targetDate} not found in latest Bybit response.`);
    return null;
  } catch (error) {
    console.error('Error fetching data from Bybit:', error.message);
    throw error;
  }
}
