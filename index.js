require('dotenv').config();

function getThaiNow() {
return new Date(
new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
);
}

console.log('🚀 index.js โหลดแล้ว', new Date());

const express = require('express');
const axios = require('axios');
const fs = require('fs');

let userIds = new Set();
const USER_IDS_FILE = './userIds.json';

if (fs.existsSync(USER_IDS_FILE)) {
try {
const data = JSON.parse(fs.readFileSync(USER_IDS_FILE, 'utf8'));
userIds = new Set(data);
} catch {}
}

function saveUserIds() {
fs.writeFileSync(USER_IDS_FILE, JSON.stringify([...userIds], null, 2));
}

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ================== DATA ==================
let appointments = [];

function loadAppointments() {
if (fs.existsSync('data.json')) {
try {
const raw = fs.readFileSync('data.json', 'utf8');
const data = JSON.parse(raw);
appointments = data.appointments || [];
} catch {
appointments = [];
}
}
}
function saveAppointments() {
fs.writeFileSync('data.json', JSON.stringify({ appointments }, null, 2));
}
loadAppointments();

const stressJokes = [
'เครียดไปก็เท่านั้น ลูกพี่!! เงินก็ยังไม่เพิ่ม 🤣',
'งานหนักไม่กลัว กลัวเงินไม่เข้า 😎',
'พักก่อนลูกพี่ หากินเหล้าซะ 😆',
'ใจเย็น ๆ ลูกพี่ ถอนดีกว่า 😂',
'เครียดแล้วผมร่วงนะลูกพี่!! 😅'
];

// ================== PUSH ==================
async function push(text) {
for (const id of userIds) {
try {
await axios.post(
'https://api.line.me/v2/bot/message/push',
{ to: id, messages: [{ type: 'text', text }] },
{ headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
);
} catch (e) {
console.error('PUSH ERROR', e.response?.data || e.message);
}
}
}

// ================== WEBHOOK ==================
app.post('/webhook', async (req, res) => {
res.sendStatus(200); // ⭐ สำคัญที่สุด

const e = req.body.events?.[0];
if (!e || e.type !== 'message' || e.message.type !== 'text') return;

const msg = e.message.text.trim();
const replyToken = e.replyToken;
const userId = e.source?.userId;

if (userId && !userIds.has(userId)) {
userIds.add(userId);
saveUserIds();
}

let reply = '🤔 ใจเย็นๆบ่ต้องฟ่าว ค่อยๆพิมพ์จารย์';

if (/สวัสดี/.test(msg)) {
reply = '👋 สวัสดีลูกพี่!! มีอะไรให้รับใช้ 😄';
} else if (msg.includes('เครียด')) {
reply = stressJokes[Math.floor(Math.random() * stressJokes.length)];
} else if (msg.includes('ขอบใจ') || msg.includes('ขอบคุณ')) {
reply = 'บ่เป็นหยังดอกลูกพี่ 😄';
} else if (msg === 'เชคระบบ' || msg === 'เช็คระบบ') {
const now = getThaiNow();
reply = `🛠 ระบบปกติ\n⏰ ${now.toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})}`;
} else if (msg === 'คำสั่ง' || msg === 'ช่วยเหลือ') {
reply = `📌 คำสั่ง
• ดูนัด
• เพิ่มนัด (พิมพ์วันเวลา)
• ว่าง
• เชคระบบ
• เครียด`;
}

await axios.post(
'https://api.line.me/v2/bot/message/reply',
{
replyToken,
messages: [{ type: 'text', text: reply }]
},
{
headers: {
'Content-Type': 'application/json',
Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
}
}
);
});

app.listen(PORT, () => {
console.log(`🤵 December พร้อมรับใช้ลูกพี่ ที่พอร์ต ${PORT}`);
});
