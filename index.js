function getThaiNow() {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' })
  );
}

console.log('🚀 index.js โหลดแล้ว', new Date());

const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;

// ================= USER IDS =================
let userIds = new Set();
const USER_IDS_FILE = './userIds.json';

if (fs.existsSync(USER_IDS_FILE)) {
  try {
    userIds = new Set(JSON.parse(fs.readFileSync(USER_IDS_FILE, 'utf8')));
  } catch {}
}

function saveUserIds() {
  fs.writeFileSync(USER_IDS_FILE, JSON.stringify([...userIds], null, 2));
}

// ================= DATA =================
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

let lastMorningNotify = null;

// ================= DATE =================
const thaiMonths = {
  'ม.ค.':0,'ก.พ.':1,'มี.ค.':2,'เม.ย.':3,'พ.ค.':4,'มิ.ย.':5,
  'ก.ค.':6,'ส.ค.':7,'ก.ย.':8,'ต.ค.':9,'พ.ย.':10,'ธ.ค.':11
};

function parseTime(t){
  const m = t.match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2,'0')}:${m[2]}` : null;
}

function parseThaiDate(t){
  const m = t.match(/(\d{1,2})\s?(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s?(\d{2})/);
  if(!m) return null;
  return new Date(2500 + Number(m[3]) - 543, thaiMonths[m[2]], Number(m[1]));
}

function parseRelativeDate(t){
  const d = getThaiNow();
  if(t.includes('พรุ่งนี้')) d.setDate(d.getDate()+1);
  else if(t.includes('มะรืน')) d.setDate(d.getDate()+2);
  else if(t.includes('สัปดาห์หน้า')) d.setDate(d.getDate()+7);
  else if(t.includes('เดือนหน้า')) d.setMonth(d.getMonth()+1);
  else if(!t.includes('วันนี้')) return null;
  return d;
}

// ================= PUSH =================
async function push(text){
  for(const id of userIds){
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      { to:id, messages:[{type:'text',text}]},
      { headers:{Authorization:`Bearer ${CHANNEL_ACCESS_TOKEN}`} }
    );
  }
}

// ================= CLEANUP =================
function cleanupPastAppointments() {
  const now = getThaiNow();
  appointments = appointments.filter(a => {
    const d = new Date(a.dateObj);
    const [h,m] = a.time.split(':').map(Number);
    d.setHours(h,m,0,0);
    return d >= now;
  });
}

// ================= INTERVAL =================
setInterval(async () => {
  const now = getThaiNow();

  // แจ้งเตือนก่อนนัด
  for (const a of appointments) {
    const target = new Date(a.dateObj);
    const [h,m] = a.time.split(':').map(Number);
    target.setHours(h,m,0,0);

    const diffMin = Math.floor((target - now)/60000);

    if (diffMin === 60 && !a.n60) {
      a.n60 = true; await push(`⏰ อีก 1 ชั่วโมง\n📝 ${a.title||'-'}`);
    }
    if (diffMin === 30 && !a.n30) {
      a.n30 = true; await push(`⏰ อีก 30 นาที\n📝 ${a.title||'-'}`);
    }
    if (diffMin === 5 && !a.n5) {
      a.n5 = true; await push(`⏰ อีก 5 นาที\n📝 ${a.title||'-'}`);
    }
    if (diffMin === 0 && !a.n0) {
      a.n0 = true; await push(`⏰ ถึงเวลานัดแล้ว\n📝 ${a.title||'-'}`);
    }
  }

  cleanupPastAppointments();
  saveAppointments();
}, 60000);

// ================= WEBHOOK =================
app.post('/webhook', async (req,res)=>{
  const e = req.body.events?.[0];
  if (!e || e.type!=='message' || e.message.type!=='text') return res.sendStatus(200);

  const userId = e.source.userId;
  if (!userIds.has(userId)) { userIds.add(userId); saveUserIds(); }

  const msg = e.message.text.trim();
  let reply = '🤔 ใจเย็นๆบ่ต้องฟ่าว ค่อยๆพิมพ์จารย์';

  if (msg === 'ดูนัด') {
    reply = appointments.length
      ? appointments.map((a,i)=>`${i+1}. ${a.time} ${a.title||'-'}`).join('\n')
      : 'ยังไม่มีนัดเลยลูกพี่ 😊';
  }

  else {
    const d = parseThaiDate(msg) || parseRelativeDate(msg);
    if (d) {
      const t = parseTime(msg) || '00:00';
      appointments.push({
        id: Date.now(),
        dateObj: d.toISOString(),
        time: t,
        title: msg
      });
      saveAppointments();
      reply = '📌 เพิ่มนัดเรียบร้อยลูกพี่';
    }
  }

  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    { replyToken:e.replyToken, messages:[{type:'text',text:reply}] },
    { headers:{Authorization:`Bearer ${CHANNEL_ACCESS_TOKEN}`} }
  );

  res.sendStatus(200);
});

app.listen(PORT, ()=>console.log('🤵 December พร้อมรับใช้'));