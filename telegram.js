// Telegram Bot Integration for Trading Alerts
const fetch = require('node-fetch');
const config = require('./config');

/**
 * Send a message to Telegram
 * @param {string} message - The message to send (supports Markdown)
 * @returns {Promise<boolean>} - Success status
 */
async function sendTelegramMessage(message) {
  if (!config.TELEGRAM_BOT_TOKEN || !config.TELEGRAM_CHAT_ID) {
    console.log('[Telegram] Bot token or chat ID not configured, skipping notification');
    return false;
  }

  const url = `https://api.telegram.org/bot${config.TELEGRAM_BOT_TOKEN}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: config.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    });

    const data = await response.json();

    if (data.ok) {
      console.log('[Telegram] Message sent successfully');
      return true;
    } else {
      console.error('[Telegram] Failed to send message:', data.description);
      return false;
    }
  } catch (error) {
    console.error('[Telegram] Error sending message:', error.message);
    return false;
  }
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
  sendAlertNotification,
  formatAnalysisMessage
};
