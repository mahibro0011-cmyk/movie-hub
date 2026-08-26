const fetch = require('node-fetch');

const BOT_TOKEN = process.env.BOT_TOKEN;
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

async function callTelegram(method, payload) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (!data.ok) {
    console.error(`Telegram API error [${method}]:`, data.description);
  }
  return data;
}

// Send a plain text message to a chat
function sendMessage(chatId, text, extra = {}) {
  return callTelegram('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

// Copy a message (e.g. a video) from the storage channel into a user's DM.
// copyMessage does NOT reveal the original channel/source to the recipient.
function copyMessageToUser(userChatId, fromChatId, messageId) {
  return callTelegram('copyMessage', {
    chat_id: userChatId,
    from_chat_id: fromChatId,
    message_id: messageId
  });
}

// Forward a message from wherever the admin sent it into the private storage channel
function copyMessageToChannel(storageChannelId, fromChatId, messageId) {
  return callTelegram('copyMessage', {
    chat_id: storageChannelId,
    from_chat_id: fromChatId,
    message_id: messageId
  });
}

// Check if a user is a member of a given channel (for "verified" tasks)
async function isChannelMember(channelId, userId) {
  const data = await callTelegram('getChatMember', { chat_id: channelId, user_id: userId });
  if (!data.ok) return false;
  const status = data.result.status;
  return ['member', 'administrator', 'creator'].includes(status);
}

module.exports = { callTelegram, sendMessage, copyMessageToUser, copyMessageToChannel, isChannelMember };
