import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  getDetailedLeaderboard, 
  getDashboardStats, 
  getRecentCandlesWithStats,
  getPredictionsForDate 
} from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initializes and starts the Express web server for the dashboard
 */
export function initServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Serve static files from the 'public' directory
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // CORS middleware for cross-origin access if needed
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  // API Endpoints

  // 1. Overall stats (users count, predictions count, evaluated candles count, correctness)
  app.get('/api/stats', (req, res) => {
    try {
      const stats = getDashboardStats();
      res.json({ success: true, data: stats });
    } catch (error) {
      console.error('[Server] Error fetching stats:', error);
      res.status(500).json({ success: false, error: 'Nepavyko gauti bendros statistikos' });
    }
  });

  // 2. Detailed leaderboard including total/correct predictions and accuracy win rate
  app.get('/api/leaderboard', (req, res) => {
    try {
      const leaderboard = getDetailedLeaderboard();
      res.json({ success: true, data: leaderboard });
    } catch (error) {
      console.error('[Server] Error fetching leaderboard:', error);
      res.status(500).json({ success: false, error: 'Nepavyko gauti lyderių lentelės' });
    }
  });

  // 3. Historical daily candles with aggregated user success rate
  app.get('/api/history', (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 30;
      const history = getRecentCandlesWithStats(limit);
      res.json({ success: true, data: history });
    } catch (error) {
      console.error('[Server] Error fetching history:', error);
      res.status(500).json({ success: false, error: 'Nepavyko gauti žvakių istorijos' });
    }
  });

  // 4. Live active predictions for the next close candle
  app.get('/api/active-predictions', (req, res) => {
    try {
      const stats = getDashboardStats();
      const predictions = getPredictionsForDate(stats.tomorrowDate);
      res.json({ 
        success: true, 
        data: {
          targetDate: stats.tomorrowDate,
          predictions: predictions
        }
      });
    } catch (error) {
      console.error('[Server] Error fetching active predictions:', error);
      res.status(500).json({ success: false, error: 'Nepavyko gauti aktyvių spėjimų' });
    }
  });

  // Serve index.html for all other requests to allow frontend navigation
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // Start listening
  app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🖥️  Dalyvių švieslentės serveris paleistas sėkmingai!`);
    console.log(`🔗 Vietinis adresas: http://localhost:${PORT}`);
    if (process.env.DASHBOARD_URL) {
      console.log(`🌍 Viešas adresas: ${process.env.DASHBOARD_URL}`);
    }
    console.log(`==================================================\n`);
  });
}
