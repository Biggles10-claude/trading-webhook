// Telegram Bot Integration for Trading Alerts
const config = require('./config');

// Use native fetch (Node 18+) or fallback to node-fetch
const fetch = globalThis.fetch || require('node-fetch');

/**
 * Send a message to a specific Telegram chat
 * @param {string} chatId - The chat ID to send to
 * @param {string} message - The message to send (supports Markdown)
 * @returns {Promise<boolean>} - Success status
 */
async function sendToChat(chatId, message) {
  if (!config.TELEGRAM_BOT_TOKEN || !chatId) {
    console.log('[Telegram] Bot token or chat ID not configured');
    return false;
  }

  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    console.log('[Telegram] Sending message to chat:', chatId);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        disable_web_page_preview: true
      })
    });

    const data = await response.json();
    console.log('[Telegram] Response:', JSON.stringify(data));

    if (data.ok) {
      console.log('[Telegram] Message sent successfully to', chatId);
      return true;
    } else {
      console.error('[Telegram] Failed to send message:', data.description);
      return false;
    }
  } catch (error) {
    console.error('[Telegram] Error sending message:', error.message, error.stack);
    return false;
  }
}

/**
 * Send a message to Telegram (user's chat)
 * @param {string} message - The message to send (supports Markdown)
 * @returns {Promise<boolean>} - Success status
 */
async function sendTelegramMessage(message) {
  console.log('[Telegram] Checking config...');
  console.log('[Telegram] Token exists:', !!config.TELEGRAM_BOT_TOKEN);
  console.log('[Telegram] Chat ID exists:', !!config.TELEGRAM_CHAT_ID);

  return sendToChat(config.TELEGRAM_CHAT_ID, message);
}

/**
 * Send auto-trigger message to the trigger channel
 * The telegram-claude-bot listens to this channel and auto-triggers /analyze
 * @param {string} message - The message to send
 * @returns {Promise<boolean>} - Success status
 */
async function sendToTriggerChannel(message) {
  if (!config.TRIGGER_CHANNEL_ID) {
    console.log('[Telegram] Trigger channel not configured, skipping');
    return false;
  }

  console.log('[Telegram] Sending to trigger channel:', config.TRIGGER_CHANNEL_ID);
  return sendToChat(config.TRIGGER_CHANNEL_ID, message);
}

/**
 * Format trading analysis results for Telegram
 * @param {object} alertData - Original alert data from TradingView
 * @param {object} analysisResult - Result from Claude Code analysis
 * @returns {string} - Formatted message
 */
function formatAnalysisMessage(alertData, analysisResult) {
  const timestamp = new Date().toISOString();
  const ticker = alertData.ticker || 'UNKNOWN';
  const condition = alertData.condition || 'ALERT';
  const price = alertData.price || 'N/A';

  let message = `🚨 *TRADING ALERT: ${ticker}*\n\n`;
  message += `📊 *Condition:* ${condition}\n`;
  message += `💰 *Price:* $${price}\n`;
  message += `🕐 *Time:* ${timestamp}\n\n`;

  if (analysisResult) {
    if (analysisResult.setup) {
      message += `✅ *SETUP FOUND*\n\n`;
      message += `📈 *Type:* ${analysisResult.setup.type || 'N/A'}\n`;
      message += `🎯 *Entry:* $${analysisResult.setup.entry || 'N/A'}\n`;
      message += `🛑 *Stop:* $${analysisResult.setup.stop || 'N/A'}\n`;
      message += `💎 *TP1:* $${analysisResult.setup.tp1 || 'N/A'}\n`;
      message += `💎 *TP2:* $${analysisResult.setup.tp2 || 'N/A'}\n`;
      message += `📊 *R:R:* ${analysisResult.setup.riskReward || 'N/A'}\n`;
      message += `📈 *Win Rate:* ${analysisResult.setup.winRate || 'N/A'}%\n`;
    } else {
      message += `⚠️ *NO SETUP* - Mixed signals\n`;
    }

    if (analysisResult.indicators) {
      message += `\n📉 *Indicators:*\n`;
      message += `• Jewel Fast: ${analysisResult.indicators.jewelFast || 'N/A'}\n`;
      message += `• Jewel Slow: ${analysisResult.indicators.jewelSlow || 'N/A'}\n`;
      message += `• MGM Momentum: ${analysisResult.indicators.mgmMomentum || 'N/A'}\n`;
      message += `• ADX: ${analysisResult.indicators.adx || 'N/A'}\n`;
    }

    if (analysisResult.recommendation) {
      message += `\n💡 *Recommendation:*\n${analysisResult.recommendation}\n`;
    }
  } else {
    message += `⏳ Analysis pending...\n`;
  }

  return message;
}

/**
 * Send alert notification to Telegram
 * @param {object} alertData - Alert data from TradingView
 * @param {object} analysisResult - Optional analysis result
 */
async function sendAlertNotification(alertData, analysisResult = null) {
  const message = formatAnalysisMessage(alertData, analysisResult);
  return await sendTelegramMessage(message);
}

module.exports = {
  sendTelegramMessage,
  sendToTriggerChannel,
  sendAlertNotification,
  formatAnalysisMessage
};
