// TradingView Webhook Server
// Receives alerts and triggers Claude Code trading analysis

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const telegram = require('./telegram');

const app = express();
app.use(express.json());
app.use(express.text());

// Ensure logs directory exists
const logsDir = path.resolve(config.LOG_DIR);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Save analysis to log file
 */
function saveToLog(alertData, analysisResult) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const ticker = alertData.ticker || 'UNKNOWN';
  const filename = `${timestamp}_${ticker}_analysis.json`;
  const filepath = path.join(logsDir, filename);

  const logData = {
    timestamp: new Date().toISOString(),
    alert: alertData,
    analysis: analysisResult
  };

  fs.writeFileSync(filepath, JSON.stringify(logData, null, 2));
  console.log(`[Log] Saved to ${filepath}`);
  return filepath;
}

/**
 * Trigger Claude Code analysis
 * This calls the Claude CLI in headless mode
 */
async function triggerClaudeAnalysis(ticker) {
  return new Promise((resolve, reject) => {
    const prompt = `Run the tradingview-extract skill on ${ticker} to get latest 100 bars, then run the trading-analysis skill. Output the full setup recommendation including entry, stop loss, take profit levels, and R:R ratio. Format output as JSON with fields: setup (object with type, entry, stop, tp1, tp2, tp3, riskReward, winRate), indicators (object with jewelFast, jewelSlow, mgmMomentum, adx), recommendation (string).`;

    // Note: This requires Claude Code CLI to be available in the environment
    // For Render.com deployment, we'll use a different approach (webhook callback)
    const command = `claude -p "${prompt}" --output-format json 2>&1`;

    console.log(`[Claude] Triggering analysis for ${ticker}...`);

    exec(command, { timeout: 300000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[Claude] Error: ${error.message}`);
        // Don't reject - return partial result
        resolve({
          error: error.message,
          stdout: stdout,
          stderr: stderr
        });
        return;
      }

      try {
        // Try to parse JSON output
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (parseError) {
        // Return raw output if not JSON
        resolve({
          raw: stdout,
          parseError: parseError.message
        });
      }
    });
  });
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'trading-webhook',
    timestamp: new Date().toISOString(),
    telegram_configured: !!(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID)
  });
});

// Health check for Render.com
app.get('/health', (req, res) => {
  res.json({ status: 'healthy' });
});

// Main webhook endpoint for TradingView
app.post('/webhook', async (req, res) => {
  console.log('[Webhook] Received alert:', JSON.stringify(req.body));

  // Parse alert data
  let alertData;
  if (typeof req.body === 'string') {
    try {
      alertData = JSON.parse(req.body);
    } catch (e) {
      alertData = { message: req.body };
    }
  } else {
    alertData = req.body;
  }

  // Add timestamp if not present
  alertData.receivedAt = new Date().toISOString();

  // Immediately respond to TradingView (they expect quick response)
  res.json({ received: true, timestamp: alertData.receivedAt });

  // Process in background
  try {
    // Send initial notification
    await telegram.sendAlertNotification(alertData, null);

    // Trigger Claude analysis (if Claude CLI is available)
    const ticker = alertData.ticker || 'ETH';
    let analysisResult = null;

    try {
      analysisResult = await triggerClaudeAnalysis(ticker);
      console.log('[Claude] Analysis complete');
    } catch (claudeError) {
      console.error('[Claude] Analysis failed:', claudeError.message);
      analysisResult = { error: claudeError.message };
    }

    // Save to log
    const logPath = saveToLog(alertData, analysisResult);

    // Send final notification with analysis
    await telegram.sendAlertNotification(alertData, analysisResult);

    console.log('[Webhook] Processing complete');
  } catch (error) {
    console.error('[Webhook] Processing error:', error.message);
  }
});

// Test endpoint for manual testing
app.post('/test', async (req, res) => {
  const testAlert = {
    ticker: req.body.ticker || 'ETH',
    condition: 'TEST_ALERT',
    price: req.body.price || '3040',
    time: new Date().toISOString()
  };

  console.log('[Test] Simulating alert:', testAlert);

  // Send test notification
  const sent = await telegram.sendAlertNotification(testAlert, {
    setup: {
      type: 'TEST SHORT',
      entry: '3040',
      stop: '3072',
      tp1: '3008',
      tp2: '2975',
      riskReward: '1:1.91',
      winRate: '57.1'
    },
    indicators: {
      jewelFast: '68.8',
      jewelSlow: '75.2',
      mgmMomentum: '-0.5',
      adx: '26.7'
    },
    recommendation: 'TEST: This is a test notification. Setup would be valid if MGM < 0.'
  });

  res.json({
    test: true,
    telegram_sent: sent,
    alert: testAlert
  });
});

// Start server
const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`[Server] Trading webhook server running on port ${PORT}`);
  console.log(`[Server] Telegram configured: ${!!(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID)}`);
  console.log(`[Server] Endpoints:`);
  console.log(`  - GET  /         - Health check`);
  console.log(`  - GET  /health   - Render health check`);
  console.log(`  - POST /webhook  - TradingView webhook`);
  console.log(`  - POST /test     - Test endpoint`);
});
