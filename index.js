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

// ================= USER ID STORE =================

let userIds = new Set();
const USER_IDS_FILE = './userIds.json';

if (fs.existsSync(USER_IDS_FILE)) {
  try {
    userIds = new Set(JSON.parse(fs.readFileSync(USER_IDS_FILE)));
    console.log(`📂 โหลด userIds แล้ว ${userIds.size} คน`);
  } catch {}
}

function saveUserIds() {
  fs.writeFileSync(USER_IDS_FILE, JSON.stringify([...userIds], null, 2));
}

// ================= APPOINTMENTS =================

let appointments = [];

function loadAppointments() {
  if (!fs.existsSync('data.json')) return [];
  try {
    return JSON.parse(fs.readFileSync('data.json')).appointments || [];
  } catch {
    return [];
  }
}

function saveAppointments() {
  fs.writeFileSync(
    'data.json',
    JSON.stringify({ appointments }, null, 2)
  );
}

appointments = loadAppointments();

// ================= DATE =================

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
  return new Date(2500 + Number(m[3]) - 543, thaiMonths[m[2]], Number(m[1]));
}

function parseRelativeDate(t){
  const d = getThaiNow();
  if(t.includes('วันนี้')) {}
  else if(t.includes('พรุ่งนี้')) d.setDate(d.getDate()+1);
  else if(t.includes('มะรืน')) d.setDate(d.getDate()+2);
  else return null;
  return d;
}

// ================= CLEANUP =================

function cleanupPastAppointments(){
  const now = getThaiNow();
  appointments = appointments.filter(a=>{
    const d = new Date(a.dateObj);
    const [h,m]=a.time.split(':').map(Number);
    d.setHours(h,m,0,0);
    return d >= now;
  });
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

// ================= NOTIFY LOOP =================

setInterval(async()=>{
  const now = getThaiNow();
  console.log('⏱ tick', now.toLocaleTimeString());

  for(const a of appointments){
    const t = new Date(a.dateObj);
    const [h,m]=a.time.split(':').map(Number);
    t.setHours(h,m,0,0);

    const diff = Math.floor((t-now)/60000);
    if(diff<0) continue;

    if(diff<=60 && diff>=59 && !a.n60){a.n60=true; await push(`⏰ อีก 1 ชั่วโมง\n📝 ${a.title}`);}
    if(diff<=30 && diff>=29 && !a.n30){a.n30=true; await push(`⏰ อีก 30 นาที\n📝 ${a.title}`);}
    if(diff<=5 && diff>=4 && !a.n5){a.n5=true; await push(`⏰ อีก 5 นาที\n📝 ${a.title}`);}
    if(diff===0 && !a.n0){a.n0=true; await push(`⏰ ถึงเวลานัด\n📝 ${a.title}`);}
  }

  const before=appointments.length;
  cleanupPastAppointments();
  if(before!==appointments.length) saveAppointments();

},60000);

// ================= WEBHOOK =================

app.post('/webhook', async (req,res)=>{
  const e=req.body.events?.[0];
  if(!e || e.type!=='message' || e.message.type!=='text')
    return res.sendStatus(200);

  const userId=e.source.userId;
  if(!userIds.has(userId)){userIds.add(userId); saveUserIds();}

  const msg=e.message.text.trim();
  let reply='พิมพ์ไม่เข้าใจลูกพี่';

  if(msg==='เช็คระบบ'||msg==='เชคระบบ'){
    reply=`🟢 ระบบทำงาน
⏰ ${getThaiNow().toLocaleTimeString('th-TH')}
📅 นัด ${appointments.length} รายการ`;
  }

  else if(msg==='ดูนัด'){
    if(!appointments.length) reply='ไม่มีนัด';
    else{
      reply=appointments.map((a,i)=>
`${i+1}. ${formatThaiDate(new Date(a.dateObj))} ${a.time} ${a.title}`
).join('\n');
    }
  }

  else if(/^ลบนัด\s*\d+/.test(msg)){
    const n=parseInt(msg.replace(/\D/g,''));
    if(n>=1 && n<=appointments.length){
      appointments.splice(n-1,1);
      saveAppointments();
      reply='ลบแล้ว';
    }
  }

  else{
    const d=parseThaiDate(msg)||parseRelativeDate(msg);
    if(d){
      const now=getThaiNow();
      const t=parseTime(msg)||'00:00';
      const [h,m]=t.split(':').map(Number);

      const dt=new Date(d);
      dt.setHours(h,m,0,0);
      if(msg.includes('วันนี้') && dt<now){
        d.setDate(d.getDate()+1);
      }

      appointments.push({
        id:Date.now(),
        dateObj:d.toISOString(),
        time:t,
        title:msg
      });

      saveAppointments();
      reply='เพิ่มนัดแล้ว';
    }
  }

  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    {
      replyToken:e.replyToken,
      messages:[{type:'text',text:reply}]
    },
    {headers:{Authorization:`Bearer ${CHANNEL_ACCESS_TOKEN}`}}
  );

  res.sendStatus(200);
});

// ================= START =================

app.listen(PORT,()=>{
  console.log(`🤵 Bot พร้อมใช้ที่พอร์ต ${PORT}`);
});