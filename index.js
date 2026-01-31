require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ================== USER IDS ==================
let userIds = new Set();
const USER_IDS_FILE = './userIds.json';

if (fs.existsSync(USER_IDS_FILE)) {
try {
const data = JSON.parse(fs.readFileSync(USER_IDS_FILE, 'utf8'));
userIds = new Set(data);
console.log(`📂 โหลด userIds ${userIds.size} คน`);
} catch (e) {
console.error('❌ โหลด userIds ไม่ได้', e);
}
}

function saveUserIds() {
fs.writeFileSync(USER_IDS_FILE, JSON.stringify([...userIds], null, 2));
}

// ================== PUSH ==================
async function push(text) {
for (const id of userIds) {
try {
await axios.post(
'https://api.line.me/v2/bot/message/push',
{
to: id,
messages: [{ type: 'text', text }]
},
{
headers: {
'Content-Type': 'application/json',
Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
}
}
);
} catch (err) {
console.error('❌ PUSH ERROR:', err.response?.data || err.message);
}
}
}

// ================== WEBHOOK ==================
app.post('/webhook', (req, res) => {
  // 1️⃣ ตอบ LINE ทันที
  res.sendStatus(200);

  // 2️⃣ ทำงานต่อแบบไม่บล็อก
  (async () => {
    try {
      const e = req.body.events?.[0];
      if (!e) return;
      if (e.type !== 'message' || !e.message || e.message.type !== 'text') return;

      const replyToken = e.replyToken;
      const text = e.message.text;

      await axios.post(
        'https://api.line.me/v2/bot/message/reply',
        {
          replyToken,
          messages: [
            { type: 'text', text: `รับแล้ว: ${text}` }
          ]
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
          }
        }
      );

      console.log('✅ reply success');
    } catch (err) {
      console.error('❌ reply error:', err.response?.data || err.message);
    }
  })();
});

// ================== START SERVER ==================
app.listen(PORT, () => {
console.log(`🤖 LINE Bot พร้อมทำงานที่พอร์ต ${PORT}`);
});
