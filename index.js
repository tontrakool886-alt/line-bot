require('dotenv').config();

// ================== TIME ==================
function getThaiNow() {
return new Date(
new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
);
}

console.log('🚀 index.js โหลดแล้ว', new Date());

// ================== REQUIRE ==================
const express = require('express');
const axios = require('axios');
const fs = require('fs');

// ================== APP ==================
const app = express();
app.use(express.json());

// ================== ENV ==================
const PORT = process.env.PORT || 3000;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

console.log(
'TOKEN CHECK:',
CHANNEL_ACCESS_TOKEN ? 'OK' : 'MISSING',
CHANNEL_ACCESS_TOKEN?.slice(0, 10)
);

// ================== USER IDS ==================
let userIds = new Set();
const USER_IDS_FILE = './userIds.json';

if (fs.existsSync(USER_IDS_FILE)) {
try {
const data = JSON.parse(fs.readFileSync(USER_IDS_FILE, 'utf8'));
userIds = new Set(data);
console.log(`📂 โหลด userIds จากไฟล์แล้ว ${userIds.size} คน`);
} catch (err) {
console.error('❌ โหลด userIds ไม่สำเร็จ', err);
}
}

function saveUserIds() {
fs.writeFileSync(USER_IDS_FILE, JSON.stringify([...userIds], null, 2));
console.log('💾 บันทึก userIds ลงไฟล์แล้ว');
}

// ================== DATA ==================
let appointments = [];

function loadAppointments() {
if (fs.existsSync('data.json')) {
try {
const raw = fs.readFileSync('data.json', 'utf8');
const data = JSON.parse(raw);
appointments = data.appointments || [];
console.log(`📂 โหลดนัดจากไฟล์แล้ว ${appointments.length} รายการ`);
} catch (err) {
console.error('❌ อ่าน data.json ไม่ได้', err);
appointments = [];
}
} else {
console.log('📂 ยังไม่มี data.json เริ่มต้นด้วยนัดว่าง');
appointments = [];
}
}

function saveAppointments() {
fs.writeFileSync(
'data.json',
JSON.stringify({ appointments }, null, 2),
'utf8'
);
console.log('💾 บันทึกนัดลงไฟล์แล้ว');
}

loadAppointments();

// ================== UTILS ==================
const stressJokes = [
'เครียดไปก็เท่านั้น ลูกพี่!! เงินก็ยังไม่เพิ่ม 🤣',
'งานหนักไม่กลัว กลัวเงินไม่เข้า 😎',
'พักก่อนลูกพี่ หากินเหล้าซะ 😆',
'ใจเย็น ๆ ลูกพี่ ถอนดีกว่า 😂',
'เครียดแล้วผมร่วงนะลูกพี่!! 😅'
];

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
else if(t.includes('สัปดาห์หน้า')) d.setDate(d.getDate()+7);
else if(t.includes('เดือนหน้า')) d.setMonth(d.getMonth()+1);
else return null;

return d;
}

function detectPhoneType(phone){
if(!phone) return '-';
if(/^0[689]\d{8}$/.test(phone)) return 'มือถือ';
if(/^0\d{8,9}$/.test(phone)) return 'เบอร์บ้าน';
return 'ไม่ทราบประเภท';
}

// ================== CLEANUP ==================
function cleanupPastAppointments() {
const now = getThaiNow();
appointments = appointments.filter(a => {
const d = new Date(a.dateObj);
const [h, m] = a.time.split(':').map(Number);
d.setHours(h, m, 0, 0);
return d >= now;
});
}

// ================== PUSH ==================
async function push(text){
for(const id of userIds){
try {
await axios.post(
'https://api.line.me/v2/bot/message/push',
{ to:id, messages:[{type:'text',text}]},
{ headers:{Authorization:`Bearer ${CHANNEL_ACCESS_TOKEN}`} }
);
} catch (err) {
console.error('❌ PUSH ERROR:', id, err.response?.data || err.message);
}
}
}

// ================== INTERVAL ==================
let lastMorningNotify = null;

setInterval(async () => {
const now = getThaiNow();
const todayKey = now.toISOString().slice(0, 10);

if (
now.getHours() === 4 &&
now.getMinutes() === 0 &&
now.getSeconds() < 5 &&
lastMorningNotify !== todayKey
) {
lastMorningNotify = todayKey;

const todayAppointments = appointments.filter(a => {
const d = new Date(a.dateObj);
return (
d.getDate() === now.getDate() &&
d.getMonth() === now.getMonth() &&
d.getFullYear() === now.getFullYear()
);
});

let text = '🌅 สรุปนัดวันนี้ลูกพี่!!\n';

if (!todayAppointments.length) {
text += 'วันนี้ไม่มีนัดครับ 😊';
} else {
todayAppointments
.sort((a, b) => a.time.localeCompare(b.time))
.forEach((a, i) => {
text += `\n${i + 1}. ⏰ ${a.time} น. 📝 ${a.title || '-'}`;
});
}

await push(text);
}

const before = appointments.length;
cleanupPastAppointments();
if (appointments.length !== before) saveAppointments();

}, 60000);

// ================== WEBHOOK (SAFE) ==================
app.post('/webhook', (req, res) => {

// ตอบ LINE ก่อน กัน timeout
res.sendStatus(200);

console.log('Webhook hit');
console.log(JSON.stringify(req.body, null, 2));

handleEvent(req.body).catch(err => {
console.error('❌ HANDLE EVENT ERROR:', err);
});
});

// ================== HANDLE EVENT ==================
async function handleEvent(body){

const e = body.events?.[0];
if (!e) return;
if (e.type !== 'message' || !e.message || e.message.type !== 'text') return;

const replyToken = e.replyToken;
const msg = e.message.text.trim();
const userId = e.source?.userId;

if (userId && !userIds.has(userId)) {
userIds.add(userId);
saveUserIds();
}

let reply = '🤔 ใจเย็นๆบ่ต้องฟ่าว ค่อยๆพิมพ์จารย์';

if (/สวัสดี/.test(msg)) reply = '👋 สวัสดีลูกพี่!! มีอะไรให้รับใช้ 😄';
else if (msg.includes('เครียด')) reply = stressJokes[Math.floor(Math.random()*stressJokes.length)];

await axios.post(
'https://api.line.me/v2/bot/message/reply',
{
replyToken,
messages: [{ type:'text', text: reply }]
},
{
headers:{
'Content-Type':'application/json',
Authorization:`Bearer ${CHANNEL_ACCESS_TOKEN}`
}
}
);
}

// ================== START ==================
app.listen(PORT, () => {
console.log(`🤵 December พร้อมรับใช้ลูกพี่ ที่พอร์ต ${PORT}`);
});