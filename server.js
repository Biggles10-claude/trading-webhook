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
 * Trigger local bot via ngrok tunnel
 * This calls the HTTP endpoint on telegram-claude-bot to trigger analysis
 */
async function triggerLocalBot(ticker) {
  const triggerUrl = config.LOCAL_BOT_TRIGGER_URL;
  if (!triggerUrl) {
    console.log('[Trigger] LOCAL_BOT_TRIGGER_URL not configured, skipping direct trigger');
    return { triggered: false, reason: 'not_configured' };
  }

  try {
    console.log(`[Trigger] Calling local bot at ${triggerUrl}/trigger for ${ticker}`);
    const response = await fetch(`${triggerUrl}/trigger`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticker })
    });

    const data = await response.json();
    console.log(`[Trigger] Response:`, JSON.stringify(data));

    return { triggered: response.ok, data };
  } catch (error) {
    console.error(`[Trigger] Error calling local bot:`, error.message);
    return { triggered: false, error: error.message };
  }
}

/**
 * Relay alert to Claude bot for processing
 * Uses HTTP trigger if configured (preferred), otherwise Telegram message
 * The alert message field becomes the prompt for Claude
 */
async function relayToClaudeBot(alertData) {
  // The "message" field from TradingView alert becomes the Claude prompt
  // If no message, fall back to a default based on ticker
  let prompt = alertData.message || alertData.prompt;

  if (!prompt) {
    // Fallback: construct a basic prompt from alert data
    let ticker = alertData.ticker || 'SOL';
    if (ticker.endsWith('USDT')) {
      ticker = ticker.replace('USDT', '');
    }
    prompt = `Run setup-check skill for ${ticker} 30m`;
  }

  const time = alertData.time || new Date().toISOString();
  const alertName = alertData.alert || 'TradingView Alert';

  // Try HTTP trigger first (preferred - directly triggers Claude bot)
  const triggerUrl = config.LOCAL_BOT_TRIGGER_URL;
  if (triggerUrl) {
    try {
      console.log(`[Relay] Calling HTTP trigger at ${triggerUrl}`);
      const response = await fetch(triggerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, message: prompt })
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`[Relay] HTTP trigger success:`, JSON.stringify(data));

        // Also send notification to Telegram (info only, not trigger)
        const notifyMessage = `🔔 *Webhook Received*\n\n📊 Alert: ${alertName}\n🕐 Time: ${time}\n📝 Prompt: ${prompt.substring(0, 100)}...`;
        await telegram.sendTelegramMessage(notifyMessage);

        return { relayed: true, prompt, method: 'http_trigger' };
      } else {
        console.error(`[Relay] HTTP trigger failed: ${response.status}`);
      }
    } catch (error) {
      console.error(`[Relay] HTTP trigger error:`, error.message);
    }
  }

  // Fallback: Send to Telegram with WEBHOOK_PROMPT marker
  console.log(`[Relay] Falling back to Telegram message`);
  const triggerMessage =
    `WEBHOOK_PROMPT:${prompt}\n\n` +
    `---\n` +
    `📊 Alert: ${alertName}\n` +
    `🕐 Time: ${time}`;

  const sent = await telegram.sendTelegramMessage(triggerMessage);
  console.log(`[Relay] Telegram message sent: ${sent}, prompt: "${prompt.substring(0, 50)}..."`);

  if (sent) {
    return { relayed: true, prompt, method: 'telegram' };
  } else {
    console.error(`[Relay] Failed to relay alert`);
    return { relayed: false, error: 'Both HTTP trigger and Telegram failed' };
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
    // Relay to Claude bot (HTTP trigger preferred, Telegram fallback)
    const relayResult = await relayToClaudeBot(alertData);

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
