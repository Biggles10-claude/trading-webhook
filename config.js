// Configuration for Trading Webhook Server
// Environment variables should be set in Render.com dashboard

module.exports = {
  // Server port (Render.com provides PORT env var)
  PORT: process.env.PORT || 3333,

  // Telegram Bot Configuration
  // Get token from @BotFather on Telegram
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',

  // Your Telegram chat ID (get from /getUpdates API after messaging bot)
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',

  // Trigger channel ID - bot posts here, telegram-claude-bot listens for auto-trigger
  // Create a private channel, add bot as admin, get channel ID (starts with -100)
  TRIGGER_CHANNEL_ID: process.env.TRIGGER_CHANNEL_ID || '',

  // Claude Code container URL (for triggering analysis)
  // This is the internal URL where Claude Code is running
  CLAUDE_CONTAINER_URL: process.env.CLAUDE_CONTAINER_URL || 'http://localhost:3001',

  // Log directory
  LOG_DIR: process.env.LOG_DIR || './logs'
};
