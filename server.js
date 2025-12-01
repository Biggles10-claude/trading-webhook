// TradingView Webhook Server
// Receives alerts and triggers Claude Code trading analysis

const express = require('express');
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
 * Relay alert to Telegram bot for Claude analysis
 * Since Render.com can't run Claude CLI, we send a special message
 * to the Telegram bot which runs locally with Claude access
 */
async function relayToTelegramBot(alertData) {
  // Extract ticker - handle both "SOL" and "SOLUSDT" formats
  let ticker = alertData.ticker || 'ETH';
  if (ticker.endsWith('USDT')) {
    ticker = ticker.replace('USDT', '');
  }

  const condition = alertData.condition || 'ALERT';
  const price = alertData.price || 'N/A';
  const alertName = alertData.alert || 'TradingView Alert';
  const action = alertData.action || 'NOTIFY';
  const time = alertData.time || new Date().toISOString();

  // Format as a command message that telegram bot will recognize
  // Bot looks for "AUTO-TRIGGER FROM TRADINGVIEW" and "Ticker:" pattern
  const analysisCommand = `/analyze ${ticker}`;

  const triggerMessage =
    `🤖 *AUTO-TRIGGER FROM TRADINGVIEW*\n\n` +
    `📊 *Alert:* ${alertName}\n` +
    `💹 *Ticker:* ${ticker}\n` +
    `💰 *Price:* $${price}\n` +
    `⚡ *Condition:* ${condition}\n` +
    `🎯 *Action:* ${action}\n` +
    `🕐 *Time:* ${time}\n\n` +
    `_Triggering: ${analysisCommand}_`;

  // Send to trigger channel (for auto-trigger) AND to user chat (for visibility)
  const channelSent = await telegram.sendToTriggerChannel(triggerMessage);
  const commandSent = await telegram.sendTelegramMessage(triggerMessage);

  console.log(`[Relay] Channel sent: ${channelSent}, User chat sent: ${commandSent}`);

  if (commandSent) {
    console.log(`[Relay] Alert relayed to Telegram for ${ticker}`);
    return { relayed: true, ticker, command: analysisCommand };
  } else {
    console.error(`[Relay] Failed to relay alert to Telegram`);
    return { relayed: false, error: 'Telegram send failed' };
  }
}

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'trading-webhook',
    timestamp: new Date().toISOString(),
    telegram_configured: !!(config.TELEGRAM_BOT_TOKEN && config.TELEGRAM_CHAT_ID),
    token_length: config.TELEGRAM_BOT_TOKEN ? config.TELEGRAM_BOT_TOKEN.length : 0,
    chat_id_length: config.TELEGRAM_CHAT_ID ? config.TELEGRAM_CHAT_ID.length : 0
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
    // Only send ONE message - the auto-trigger relay
    // The telegram-claude-bot will detect this and run /analyze automatically
    const relayResult = await relayToTelegramBot(alertData);

    // Save to log
    const logPath = saveToLog(alertData, relayResult);

    console.log('[Webhook] Alert relayed, analysis will be triggered by Telegram bot');
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
