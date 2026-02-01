require('dotenv').config();

function getThaiNow() {
return new Date(
new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
);
}

const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

// ================== USER IDS ==================
const USER_IDS_FILE = './userIds.json';
let userIds = new Set();

if (fs.existsSync(USER_IDS_FILE)) {
try {
userIds = new Set(JSON.parse(fs.readFileSync(USER_IDS_FILE, 'utf8')));
} catch {}
}
function saveUserIds() {
fs.writeFileSync(USER_IDS_FILE, JSON.stringify([...userIds], null, 2));
}

// ================== DATA ==================
let appointments = [];

function loadAppointments() {
if (fs.existsSync('data.json')) {
try {
appointments = JSON.parse(fs.readFileSync('data.json')).appointments || [];
} catch {
appointments = [];
}
}
}
function saveAppointments() {
fs.writeFileSync('data.json', JSON.stringify({ appointments }, null, 2));
}
loadAppointments();

// ================== MUK ==================
const stressJokes = [
'เครียดไปก็เท่านั้น ลูกพี่!! เงินก็ยังไม่เพิ่ม 🤣',
'งานหนักไม่กลัว กลัวเงินไม่เข้า 😎',
'พักก่อนลูกพี่ หากินเหล้าซะ 😆',
'ใจเย็น ๆ ลูกพี่ ถอนดีกว่า 😂',
'เครียดแล้วผมร่วงนะลูกพี่!! 😅'
];

// ================== WEBHOOK ==================
app.post('/webhook', async (req, res) => {
// ✅ ตอบทันที กัน timeout / echo
res.sendStatus(200);

const e = req.body.events?.[0];
if (!e || e.type !== 'message' || e.message.type !== 'text') return;

const msg = e.message.text.trim();
const replyToken = e.replyToken;
const userId = e.source?.userId;

if (userId && !userIds.has(userId)) {
userIds.add(userId);
saveUserIds();
}

let reply = '🤔 ใจเย็น ๆ ลูกพี่ ค่อย ๆ พิมพ์มา';

// ===== สวัสดี =====
if (/สวัสดี/.test(msg)) {
reply = '👋 สวัสดีลูกพี่!! มีอะไรให้รับใช้ 😄';
}

// ===== เครียด =====
else if (msg.includes('เครียด')) {
reply = stressJokes[Math.floor(Math.random() * stressJokes.length)];
}

// ===== ขอบคุณ =====
else if (msg.includes('ขอบใจ') || msg.includes('ขอบคุณ')) {
reply = 'บ่เป็นหยังดอกลูกพี่ 😄';
}

// ===== คำสั่ง =====
else if (msg === 'คำสั่ง' || msg === 'ช่วยเหลือ') {
reply = `📌 คำสั่ง
• ดูนัด
• ลบนัด 1
• วันนี้ว่างไม๊
• เชคระบบ
• พิมพ์วันเวลา → เพิ่มนัด`;
}

// ===== ดูนัด =====
else if (msg === 'ดูนัด') {
if (!appointments.length) {
reply = 'ยังไม่มีนัดเลยลูกพี่ 😊';
} else {
reply = appointments
.map(
(a, i) =>
`${i + 1}. 📅 ${new Date(a.dateObj).toLocaleDateString('th-TH')}
⏰ ${a.time} น.
📝 ${a.title || '-'}`
)
.join('\n\n');
}
}

// ===== ลบนัด =====
else if (/^ลบนัด\s*\d+/.test(msg)) {
const idx = parseInt(msg.replace(/\D/g, ''), 10) - 1;
if (idx < 0 || idx >= appointments.length) {
reply = '❌ ไม่มีนัดลำดับนี้';
} else {
const del = appointments.splice(idx, 1)[0];
saveAppointments();
reply = `🗑️ ลบนัดแล้ว\n⏰ ${del.time} 📝 ${del.title || '-'}`;
}
}

// ===== ว่าง =====
else if (msg.includes('ว่าง')) {
if (!appointments.length) {
reply = 'วันนี้ว่างทั้งวันเลยลูกพี่ 😄';
} else {
reply = 'วันนี้มีนัดแล้วลูกพี่ ลองพิมพ์ “ดูนัด” ดูนะ';
}
}

// ===== เชคระบบ =====
else if (msg === 'เช็คระบบ' || msg === 'เชคระบบ') {
const now = getThaiNow();
reply = `🛠 ระบบปกติ
⏰ ${now.toLocaleTimeString('th-TH')}
📅 นัดคงเหลือ ${appointments.length} รายการ`;
}

// ===== เพิ่มนัด =====
else {
const timeMatch = msg.match(/(\d{1,2}):(\d{2})/);
if (timeMatch) {
const time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2]}`;
appointments.push({
id: Date.now(),
dateObj: new Date().toISOString(),
time,
title: msg.replace(timeMatch[0], '').trim()
});
saveAppointments();
reply = `📌 เพิ่มนัดแล้วลูกพี่\n⏰ ${time}`;
}
}

// ===== reply =====
try {
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
} catch (err) {
console.error('❌ Reply error', err.message);
}
});

app.listen(PORT, () => {
console.log(`🤵 December พร้อมรับใช้ลูกพี่ ที่พอร์ต ${PORT}`);
});
