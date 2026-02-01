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

// ================== DATA ==================
let appointments = [];
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

// ================== WEBHOOK ==================
app.post('/webhook', async (req, res) => {
res.sendStatus(200); // ✅ ตอบ LINE ทันที

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

// ===== คำสั่งพื้นฐาน =====
if (/สวัสดี/.test(msg)) reply = '👋 สวัสดีลูกพี่!! มีอะไรให้ผมรับใช้ ';
else if (msg.includes('เครียด'))
reply = [
'เครียดไปก็เท่านั้น ลูกพี่!! 🤣',
'จั่งซี้มันต้องถอน 😆',
'หากินเหล้าป่ะ 😂'
][Math.floor(Math.random() * 3)];
else if (msg.includes('ขอบใจ') || msg.includes('ขอบคุณ'))
reply = 'บ่เป็นหยังดอกอ้ายหำแหล่ 😄';
else if (msg === 'คำสั่ง' || msg === 'ช่วยเหลือ')
reply = `📌 คำสั่ง
• ดูนัด
• ลบนัด 1
• วันนี้ว่างไม๊
• เชคระบบ
• พิมพ์วันเวลา → เพิ่มนัด`;

// ===== ดูนัด =====
else if (msg === 'ดูนัด') {
if (!appointments.length) reply = 'ยังไม่มีนัดเลยลูกพี่ 😊';
else {
reply = appointments
.map((a, i) => `${i + 1}. ${a.time} ${a.title || '-'}`)
.join('\n');
}
}

// ===== เช็คระบบ =====
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
const time = `${timeMatch[1].padStart(2,'0')}:${timeMatch[2]}`;
appointments.push({
id: Date.now(),
dateObj: new Date().toISOString(),
time,
title: msg.replace(timeMatch[0], '').trim()
});
saveAppointments();
reply = `📌 เพิ่มนัดแล้ว\n⏰ ${time}`;
}
}

// ✅ reply ครั้งเดียว
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
