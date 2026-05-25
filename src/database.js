import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure the data directory exists
const dbDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'database.sqlite');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

/**
 * Initializes the SQLite database schemas
 */
export function dbInit() {
  // Create users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY,
      username TEXT,
      first_name TEXT,
      score_weekly INTEGER DEFAULT 0,
      score_monthly INTEGER DEFAULT 0,
      score_all_time INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create predictions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      target_date TEXT,      -- Format: YYYY-MM-DD
      prediction TEXT,       -- 'UP' (Green 🟩) or 'DOWN' (Red 🟥)
      submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(user_id),
      UNIQUE(user_id, target_date)
    )
  `);

  // Create candles table
  db.exec(`
    CREATE TABLE IF NOT EXISTS candles (
      candle_date TEXT PRIMARY KEY, -- Format: YYYY-MM-DD
      open_price REAL,
      close_price REAL,
      color TEXT,                   -- 'GREEN', 'RED', 'FLAT'
      evaluated INTEGER DEFAULT 0   -- 0 = pending, 1 = completed
    )
  `);
}

/**
 * Upserts a Telegram user in the database
 */
export function upsertUser(userId, username, firstName) {
  const query = `
    INSERT INTO users (user_id, username, first_name)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      first_name = excluded.first_name
  `;
  const stmt = db.prepare(query);
  return stmt.run(userId, username || null, firstName || null);
}

/**
 * Inserts or updates a user's prediction for a specific target date
 */
export function upsertPrediction(userId, targetDate, prediction) {
  const query = `
    INSERT INTO predictions (user_id, target_date, prediction, submitted_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(user_id, target_date) DO UPDATE SET
      prediction = excluded.prediction,
      submitted_at = CURRENT_TIMESTAMP
  `;
  const stmt = db.prepare(query);
  return stmt.run(userId, targetDate, prediction);
}

/**
 * Gets a prediction for a single user for a specific target date
 */
export function getUserPrediction(userId, targetDate) {
  const stmt = db.prepare('SELECT * FROM predictions WHERE user_id = ? AND target_date = ?');
  return stmt.get(userId, targetDate);
}

/**
 * Gets all predictions submitted for a specific target date
 */
export function getPredictionsForDate(targetDate) {
  const query = `
    SELECT p.user_id, p.prediction, p.submitted_at, u.username, u.first_name
    FROM predictions p
    JOIN users u ON p.user_id = u.user_id
    WHERE p.target_date = ?
  `;
  const stmt = db.prepare(query);
  return stmt.all(targetDate);
}

/**
 * Saves a daily candle's fetched results
 */
export function upsertCandle(candleDate, openPrice, closePrice, color, evaluated = 0) {
  const query = `
    INSERT INTO candles (candle_date, open_price, close_price, color, evaluated)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(candle_date) DO UPDATE SET
      open_price = excluded.open_price,
      close_price = excluded.close_price,
      color = excluded.color,
      evaluated = excluded.evaluated
  `;
  const stmt = db.prepare(query);
  return stmt.run(candleDate, openPrice, closePrice, color, evaluated);
}

/**
 * Retrieves cached candle data
 */
export function getCandle(candleDate) {
  const stmt = db.prepare('SELECT * FROM candles WHERE candle_date = ?');
  return stmt.get(candleDate);
}

/**
 * Awards a point to a user for a correct prediction
 */
export function awardPoint(userId) {
  const query = `
    UPDATE users
    SET score_weekly = score_weekly + 1,
        score_monthly = score_monthly + 1,
        score_all_time = score_all_time + 1
    WHERE user_id = ?
  `;
  const stmt = db.prepare(query);
  return stmt.run(userId);
}

/**
 * Retrieves the current leaderboard based on type
 * @param {'weekly' | 'monthly' | 'all_time'} type 
 * @param {number} limit 
 */
export function getLeaderboard(type = 'weekly', limit = 10) {
  let scoreColumn = 'score_weekly';
  if (type === 'monthly') scoreColumn = 'score_monthly';
  if (type === 'all_time') scoreColumn = 'score_all_time';

  const query = `
    SELECT user_id, username, first_name, ${scoreColumn} AS score
    FROM users
    WHERE ${scoreColumn} > 0
    ORDER BY score DESC, username ASC, first_name ASC
    LIMIT ?
  `;
  const stmt = db.prepare(query);
  return stmt.all(limit);
}

/**
 * Resets the specified leaderboard score for all users
 * @param {'weekly' | 'monthly'} type 
 */
export function resetLeaderboard(type) {
  let scoreColumn = 'score_weekly';
  if (type === 'monthly') scoreColumn = 'score_monthly';

  const query = `UPDATE users SET ${scoreColumn} = 0`;
  const stmt = db.prepare(query);
  return stmt.run();
}
