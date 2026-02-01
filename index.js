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

// ================== มุข ==================
const stressJokes = [
'เครียดไปก็เท่านั้น ลูกพี่!! เงินก็ยังไม่เพิ่ม 🤣',
'งานหนักไม่กลัว กลัวเงินไม่เข้า 😎',
'พักก่อนลูกพี่ หากินเหล้าซะ 😆',
'ใจเย็น ๆ ลูกพี่ ถอนดีกว่า 😂',
'เครียดแล้วผมร่วงนะลูกพี่!! 😅'
];

const tiredReplies = [
'ก็ไปนอนสิ!! 😴',
'เซาซะติหล่ะ!! 😂'
];

// ================== DATE ==================
const thaiMonths = {
'ม.ค.':0,'ก.พ.':1,'มี.ค.':2,'เม.ย.':3,'พ.ค.':4,'มิ.ย.':5,
'ก.ค.':6,'ส.ค.':7,'ก.ย.':8,'ต.ค.':9,'พ.ย.':10,'ธ.ค.':11
};

function formatThaiDate(d){
return d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'});
}
function parseTime(t){
const m = t.match(/(\d{1,2})[:.](\d{2})/);
return m ? `${m[1].padStart(2,'0')}:${m[2]}` : null;
}
function parseThaiDate(t){
const m = t.match(/(\d{1,2})\s?(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s?(\d{2})/);
if(!m) return null;
const d = new Date(2500 + Number(m[3]) - 543, thaiMonths[m[2]], Number(m[1]));
d.setHours(0,0,0,0);
return d;
}
function parseRelativeDate(t){
const d = getThaiNow();
d.setHours(0,0,0,0);
if(t.includes('วันนี้')) {}
else if(t.includes('พรุ่งนี้')) d.setDate(d.getDate()+1);
else if(t.includes('มะรืน')) d.setDate(d.getDate()+2);
else return null;
return d;
}

// ================== WEBHOOK ==================
app.post('/webhook', async (req, res) => {
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

if (/สวัสดี/.test(msg)) {
reply = '👋 สวัสดีลูกพี่!! มีอะไรให้รับใช้ 😄';
}
else if (msg.includes('เครียด')) {
reply = stressJokes[Math.floor(Math.random() * stressJokes.length)];
}
else if (msg.includes('เหนื่อย')) {
reply = tiredReplies[Math.floor(Math.random() * tiredReplies.length)];
}
else if (msg.includes('ขอบใจ') || msg.includes('ขอบคุณ')) {
reply = 'บ่เป็นหยังดอกลูกพี่ 😄';
}
else if (msg === 'คำสั่ง' || msg === 'ช่วยเหลือ') {
reply = `📌 คำสั่ง
• พิมพ์วันเวลา → เพิ่มนัด
• ดูนัด
• ลบนัด 1
• วันนี้ว่างไม๊
• เชคระบบ`;
}
else if (msg === 'ดูนัด') {
if (!appointments.length) {
reply = 'ยังไม่มีนัดเลยลูกพี่ 😊';
} else {
reply = appointments
.map((a,i)=>`${i+1}. ${formatThaiDate(new Date(a.dateObj))} ⏰ ${a.time}\n📝 ${a.title || '-'}`)
.join('\n\n');
}
}
else if (msg === 'เช็คระบบ' || msg === 'เชคระบบ') {
const now = getThaiNow();
reply = `🛠 ระบบปกติ
⏰ ${now.toLocaleTimeString('th-TH')}
📅 นัดคงเหลือ ${appointments.length} รายการ`;
}
else {
const d = parseThaiDate(msg) || parseRelativeDate(msg);
if (d) {
const t = parseTime(msg) || '00:00';

const exists = appointments.some(a =>
a.dateObj === d.toISOString() && a.time === t
);

if (exists) {
reply = `⚠️ เวลานี้มีนัดแล้วลูกพี่`;
} else {
const title = msg.replace(/(\d{1,2}[:.]\d{2}|วันนี้|พรุ่งนี้|มะรืน)/g,'').trim();
appointments.push({
id: Date.now(),
dateObj: d.toISOString(),
time: t,
title
});
saveAppointments();
reply = `📌 เพิ่มนัดแล้วลูกพี่!!
📅 ${formatThaiDate(d)}
⏰ ${t}
📝 ${title || '-'}`;
}
}
}

try {
await axios.post(
'https://api.line.me/v2/bot/message/reply',
{ replyToken, messages: [{ type:'text', text: reply }] },
{ headers:{ Authorization:`Bearer ${CHANNEL_ACCESS_TOKEN}` } }
);
} catch (err) {
console.error('❌ Reply error', err.message);
}
});

app.listen(PORT, () => {
console.log(`🤵 December พร้อมรับใช้ลูกพี่ ที่พอร์ต ${PORT}`);
});
