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
// ✅ ตอบ LINE ทันที กัน timeout
res.sendStatus(200);

// ✅ ทำงานหนักใน background
(async () => {
try {
console.log('Webhook hit');
console.log(JSON.stringify(req.body, null, 2));

const e = req.body.events?.[0];
if (!e) return;
if (e.type !== 'message') return;
if (!e.message || e.message.type !== 'text') return;

const userId = e.source?.userId;
if (userId && !userIds.has(userId)) {
userIds.add(userId);
saveUserIds();
console.log('➕ เพิ่ม userId:', userId);
}

const text = e.message.text.trim();
let reply = 'รับแล้วครับลูกพี่ ✅';

if (text.includes('สวัสดี')) {
reply = '👋 สวัสดีครับลูกพี่';
} else if (text.includes('เช็คระบบ')) {
reply = '🟢 ระบบทำงานปกติ';
}

// 🔁 reply กลับ LINE
await axios.post(
'https://api.line.me/v2/bot/message/reply',
{
replyToken: e.replyToken,
messages: [{ type: 'text', text: reply }]
},
{
headers: {
'Content-Type': 'application/json',
Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
}
}
);

console.log('📨 reply ส่งแล้ว');
} catch (err) {
console.error('❌ WEBHOOK ERROR:', err.response?.data || err.message);
}
})();
});

// ================== START SERVER ==================
app.listen(PORT, () => {
console.log(`🤖 LINE Bot พร้อมทำงานที่พอร์ต ${PORT}`);
});
