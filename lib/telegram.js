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

// Send a photo with an optional caption to a chat (used for admin -> user
// custom messages that include an image).
function sendPhoto(chatId, photoUrl, caption, extra = {}) {
  return callTelegram('sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
    ...extra
  });
}

// Copy a message (e.g. the admin's original video) straight into a user's DM.
// copyMessage does NOT reveal the original chat/source to the recipient -
// the user only ever sees the video arrive in their own chat with the bot.
function copyMessageToUser(userChatId, fromChatId, messageId) {
  return callTelegram('copyMessage', {
    chat_id: userChatId,
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

module.exports = { callTelegram, sendMessage, sendPhoto, copyMessageToUser, isChannelMember };
