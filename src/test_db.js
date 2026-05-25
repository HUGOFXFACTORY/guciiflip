import { 
  dbInit, 
  upsertUser, 
  upsertPrediction, 
  getPredictionsForDate, 
  awardPoint, 
  getLeaderboard 
} from './database.js';

async function runTest() {
  console.log('--- Database Integration Test ---');
  
  // 1. Init DB
  dbInit();
  console.log('✓ DB Initialized');

  // 2. Register mock users
  upsertUser(1001, 'jonas_sniper', 'Jonas');
  upsertUser(1002, 'petras_99', 'Petras');
  upsertUser(1003, null, 'Karolis'); // user without username
  console.log('✓ Mock users registered');

  // 3. Submit predictions for target date '2026-05-26'
  const targetDate = '2026-05-26';
  upsertPrediction(1001, targetDate, 'UP');
  upsertPrediction(1002, targetDate, 'DOWN');
  upsertPrediction(1003, targetDate, 'UP');
  
  // Test duplicate update (Jonas changes his mind)
  upsertPrediction(1001, targetDate, 'DOWN'); // Jonas changes to DOWN
  upsertPrediction(1001, targetDate, 'UP');   // Jonas changes back to UP
  
  console.log(`✓ Predictions submitted for target date: ${targetDate}`);

  // 4. Retrieve predictions and display
  const predictions = getPredictionsForDate(targetDate);
  console.log('\nSubmitted predictions in DB:');
  predictions.forEach(p => {
    console.log(`- User: ${p.first_name} (${p.username || 'No Username'}), Choice: ${p.prediction}, Time: ${p.submitted_at}`);
  });

  // 5. Evaluate: Assume candle outcome is 'GREEN' (UP)
  const actualOutcome = 'GREEN';
  console.log(`\nEvaluating target date ${targetDate} with actual outcome: ${actualOutcome}`);
  
  predictions.forEach(p => {
    const isCorrect = (p.prediction === 'UP' && actualOutcome === 'GREEN') ||
                      (p.prediction === 'DOWN' && actualOutcome === 'RED');
    
    if (isCorrect) {
      console.log(`🎯 ${p.first_name} guessed correctly! Awarding point.`);
      awardPoint(p.user_id);
    } else {
      console.log(`❌ ${p.first_name} guessed incorrectly.`);
    }
  });

  // 6. Fetch Leaderboard
  console.log('\n--- Leaderboard ---');
  const board = getLeaderboard('weekly', 5);
  board.forEach((u, index) => {
    console.log(`${index + 1}. ${u.first_name} (${u.username || 'No Username'}): ${u.score} pts`);
  });

  console.log('\nDatabase integration test finished successfully!');
}

runTest();
