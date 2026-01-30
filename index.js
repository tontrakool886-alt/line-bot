console.log('🚀 index.js โหลดแล้ว', new Date());
const express = require('express');
const axios = require('axios');
const fs = require('fs');
let userIds = new Set();
const USER_IDS_FILE = './userIds.json';

// โหลด userIds จากไฟล์
if (fs.existsSync(USER_IDS_FILE)) {
  try {
    const data = JSON.parse(fs.readFileSync(USER_IDS_FILE, 'utf8'));
    userIds = new Set(data);
    console.log(`📂 โหลด userIds จากไฟล์แล้ว ${userIds.size} คน`);
  } catch (err) {
    console.error('❌ โหลด userIds ไม่สำเร็จ', err);
  }
}

// ฟังก์ชันบันทึก
function saveUserIds() {
  fs.writeFileSync(USER_IDS_FILE, JSON.stringify([...userIds], null, 2));
  console.log('💾 บันทึก userIds ลงไฟล์แล้ว');
}
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const CHANNEL_ACCESS_TOKEN = process.env.LINE_TOKEN;

// ================== DATA ==================

let appointments = [];
// 📂 โหลดนัดจากไฟล์ (ตอนเปิดเซิร์ฟเวอร์)
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

// 💾 เซฟนัดลงไฟล์
function saveAppointments() {
  fs.writeFileSync(
    'data.json',
    JSON.stringify({ appointments }, null, 2),
    'utf8'
  );
  console.log('💾 บันทึกนัดลงไฟล์แล้ว');
}

// ✅ เรียกใช้หลังประกาศฟังก์ชัน
loadAppointments(); // 

let lastMorningNotify = '';
// ================== มุข ==================
const stressJokes = [
  'เครียดไปก็เท่านั้น ลูกพี่!! เงินก็ยังไม่เพิ่ม 🤣',
  'งานหนักไม่กลัว กลัวเงินไม่เข้า 😎',
  'พักก่อนลูกพี่ หากินเหล้าซะ 😆',
  'ใจเย็น ๆ ลูกพี่ ถอนดีกว่า 😂',
  'เครียดแล้วผมร่วงนะลูกพี่!! 😅'
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
  return new Date(2500 + Number(m[3]) - 543, thaiMonths[m[2]], Number(m[1]));
}

function parseRelativeDate(t){
  const d = new Date();

  if(t.includes('วันนี้')) {
    // ไม่ต้องขยับวัน
  }
  else if(t.includes('พรุ่งนี้')) d.setDate(d.getDate()+1);
  else if(t.includes('มะรืน')) d.setDate(d.getDate()+2);
  else if(t.includes('สัปดาห์หน้า')) d.setDate(d.getDate()+7);
  else if(t.includes('เดือนหน้า')) d.setMonth(d.getMonth()+1);
  else return null;

  return d;
}

// ================== PHONE TYPE ==================
function detectPhoneType(phone){
  if(!phone) return '-';
  if(/^0[689]\d{8}$/.test(phone)) return 'มือถือ';
  if(/^0\d{8,9}$/.test(phone)) return 'เบอร์บ้าน';
  return 'ไม่ทราบประเภท';
}

// ================== PUSH ==================
async function push(text){
  for(const id of userIds){
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      { to:id, messages:[{type:'text',text}]},
      { headers:{Authorization:`Bearer ${CHANNEL_ACCESS_TOKEN}`} }
    );
  }
}

// ================== ลบนัดที่ผ่านไปแล้ว ==================
// ================== ลบนัดที่ผ่านไปแล้ว ==================
function cleanupPastAppointments() {
  const now = new Date();

  appointments = appointments.filter(a => {
    const d = new Date(a.dateObj);
    const [h, m] = a.time.split(':').map(Number);

    d.setHours(h, m, 0, 0); // รวมวัน + เวลา

    return d >= now;
  });
}

// ================== แจ้งเตือน + cleanup ==================
setInterval(async () => {
  console.log('🔥 setInterval ทำงาน', new Date());	
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);

  // 🌅 แจ้งเตือนตอนเช้า 04:00 น.
  if (
    now.getHours() === 4 &&
    now.getMinutes() === 0 &&
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
    console.log('🌅 แจ้งเตือนตี 4 แล้ว');
  }

  // ================= 🔔 แจ้งเตือนก่อนนัด =================
  for (const a of appointments) {
    const target = new Date(a.dateObj);
    const [h, m] = a.time.split(':').map(Number);
    target.setHours(h, m, 0, 0);

    const diffMin = Math.floor((target - now) / 60000);

    // ⏰ ก่อน 1 ชั่วโมง
    if (diffMin === 60 && !a.n60) {
      a.n60 = true;
      await push(`⏰ อีก 1 ชั่วโมง\n📝 ${a.title || '-'}`);
      saveAppointments();
    }

    // ⏰ ก่อน 30 นาที
    if (diffMin === 30 && !a.n30) {
      a.n30 = true;
      await push(`⏰ อีก 30 นาที\n📝 ${a.title || '-'}`);
      saveAppointments();
    }

    // ⏰ ก่อน 5 นาที
    if (diffMin === 5 && !a.n5) {
      a.n5 = true;
      await push(`⏰ อีก 5 นาที\n📝 ${a.title || '-'}`);
      saveAppointments();
    }

    // 🔥 ถึงเวลา
    if (diffMin === 0 && !a.n0) {
      a.n0 = true;
      await push(`⏰ ถึงเวลานัดแล้ว\n📝 ${a.title || '-'}`);
      saveAppointments();
    }
  }

 // 🧹 ลบนัดที่ผ่านเวลาแล้ว + เซฟไฟล์
const before = appointments.length;
cleanupPastAppointments();
if (appointments.length !== before) {
  saveAppointments();
}
}, 60000); // เช็คทุก 1 นาที

 // ================== WEBHOOK ==================
app.post('/webhook', async (req, res) => {
  console.log('Webhook hit');
  console.log(JSON.stringify(req.body, null, 2));

  const e = req.body.events?.[0];
  if (!e) return res.sendStatus(200);  // ✅ กัน event ที่ไม่ใช่ข้อความ
  if (e.type !== 'message' || !e.message || e.message.type !== 'text') {
    return res.sendStatus(200);
  }

   const userId = e.source?.userId;

if (userId && !userIds.has(userId)) {
  userIds.add(userId);
  console.log('➕ เพิ่ม userId ใหม่:', userId);
  saveUserIds(); // 💾 เซฟทุกครั้งที่มีคนทัก
}
  const msg = e.message.text.trim();
  let reply = '🤔 ใจเย็นๆบ่ต้องฟ่าว ค่อยๆพิมพ์จารย์ ';

  const before = appointments.length;
cleanupPastAppointments();
if (appointments.length !== before) {
  saveAppointments();
}

  if(/สวัสดี/.test(msg)){
    reply='👋 สวัสดีลูกพี่!! มีอะไรให้รับใช้ 😄';
  }

  else if(msg.includes('เครียด')){
    reply=stressJokes[Math.floor(Math.random()*stressJokes.length)];
  }
  else if (msg.includes('เหนื่อย')) {
  const tiredReply = [
    'ก็ไปนอนสิ!! 😴',
    'เซาซะติหล่ะ!! 😂'
  ];
  reply = tiredReply[Math.floor(Math.random() * tiredReply.length)];
}

else if (msg.includes('ขอบใจ') || msg.includes('ขอบคุณ')) {
  const thanksReply = [
    'บ่เป็นหยังดอกอ้าหำแหล่ 😄',
    '555555 จ๊ะ 😂'
  ];
  reply = thanksReply[Math.floor(Math.random() * thanksReply.length)];
}
  else if(msg==='ช่วยเหลือ'||msg==='คำสั่ง'){
  reply=`📌 คำสั่ง
• พิมพ์วันเวลา → เพิ่มนัด
• ดูนัด
• ลบนัด 1
• วันนี้ว่างไม๊
• เชคระบบ`;
}

  // ===== ดูนัด =====
  else if(msg==='ดูนัด'||msg==='ดูรายการนัด'){
  if(!appointments.length){
    reply='ยังไม่มีนัดเลยลูกพี่ 😊';
  }else{
    const sorted = [...appointments].sort((a, b) => {
  const da = new Date(a.dateObj);
  da.setHours(
    Number(a.time.split(':')[0]),
    Number(a.time.split(':')[1]),
    0,
    0
  );

  const db = new Date(b.dateObj);
  db.setHours(
    Number(b.time.split(':')[0]),
    Number(b.time.split(':')[1]),
    0,
    0
  );

  return da - db;
});

    reply=`📅 รายการนัดของลูกพี่!!

${sorted.map((a,i)=>
`${i+1}. ${formatThaiDate(new Date(a.dateObj))} ⏰ ${a.time} น.
📝 ${a.title || '-'}
☎️ ${a.phone || '-'} (${a.phoneType || '-'})`
).join('\n\n')}`;
  }
}
// ===== ลบนัด =====
else if (/^ลบนัด\s*\d+/.test(msg)) {
  const num = parseInt(msg.replace(/\D/g, ''), 10);

  if (!appointments.length) {
    reply = '❌ ยังไม่มีนัดให้ลบเลยลูกพี่';
  } else {
    // เรียงเหมือนตอนดูนัด
    const sorted = [...appointments].sort((a, b) => {
      const da = new Date(a.dateObj);
      const db = new Date(b.dateObj);
      da.setHours(...a.time.split(':').map(Number));
      db.setHours(...b.time.split(':').map(Number));
      return da - db;
    });

    if (num < 1 || num > sorted.length) {
      reply = `❌ ไม่มีนัดลำดับที่ ${num} ลูกพี่`;
    } else {
      const target = sorted[num - 1];

      // ✅ ลบด้วย ID (แม่น 100%)
      appointments = appointments.filter(a => a.id !== target.id);
      saveAppointments();

      reply = `🗑️ ลบนัดเรียบร้อยลูกพี่!!
📅 ${formatThaiDate(new Date(target.dateObj))}
⏰ ${target.time} น.
📝 ${target.title || '-'}`;
    }
  }
}

// ===== วันนี้ว่างไม๊ =====
// ===== เชคเวลาว่าง (แค่พิมพ์คำว่า "ว่าง") =====
// ===== เชคเวลาว่าง (แค่พิมพ์คำว่า "ว่าง") =====
else if (msg.includes('ว่าง')) {
  const now = new Date();

  const pad = n => n.toString().padStart(2, '0');
  const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const todayList = appointments
    .filter(a => {
      const d = new Date(a.dateObj);
      return (
        d.getDate() === now.getDate() &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear()
      );
    })
    .sort((a, b) => a.time.localeCompare(b.time));

  if (!todayList.length) {
    reply = `📭 ตอนนี้ถึงสิ้นวันว่างหมดเลยลูกพี่ 😄\n🕒 ${nowTime} - 23:59`;
  } else {
    let free = [];
    let lastEnd = nowTime;

    for (const a of todayList) {
      if (lastEnd < a.time) {
        free.push(`${lastEnd} - ${a.time}`);
      }
      lastEnd = a.time;
    }

    if (lastEnd < '23:59') {
      free.push(`${lastEnd} - 23:59`);
    }

    if (!free.length) {
      reply = '⛔ วันนี้ไม่มีเวลาว่างแล้วลูกพี่ 😅';
    } else {
      reply = `🕒 ตอนนี้ลูกพี่ว่างช่วง\n• ${free.join('\n• ')}`;
    }
  }
}

// ===== เชคระบบ =====
else if (msg === 'เชคระบบ' || msg === 'เช็กระบบ') {
  const now = new Date();
  const time = now.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit'
  });

  reply =
`🟢 ระบบทำงานปกติ
⏰ เวลาปัจจุบัน: ${time}
📅 นัดคงเหลือ: ${appointments.length} รายการ`;
}

  // ===== เพิ่มนัด =====
// ===== เพิ่มนัด (รองรับ วันนี้ / ใส่แต่เวลา) =====
else {
  const d = parseThaiDate(msg) || parseRelativeDate(msg);

  if (d) {
    const t = parseTime(msg) || '00:00';
    const isToday = msg.includes('วันนี้');
    const now = new Date();
    const [hour, minute] = t.split(':');

const appointmentDateTime = new Date(
  d.getFullYear(),
  d.getMonth(),
  d.getDate(),
  parseInt(hour),
  parseInt(minute)
);
if (isToday && appointmentDateTime < now) {
  appointmentDateTime.setDate(appointmentDateTime.getDate() + 1);
  d.setDate(d.getDate() + 1); // สำคัญมาก ต้องขยับ d ด้วย
}
    const phone = msg.match(/0\d{8,9}/)?.[0] || '';

   const exists = appointments.some(a => {
  const ad = new Date(a.dateObj);
  return (
    ad.getDate() === d.getDate() &&
    ad.getMonth() === d.getMonth() &&
    ad.getFullYear() === d.getFullYear() &&
    a.time === t
  );
});

    if (exists) {
      reply = `⚠️ เวลานี้มีนัดอยู่แล้วลูกพี่!!
📅 ${formatThaiDate(d)}
⏰ ${t} น.`;
    } else {

      let title = msg
        .replace(/0\d{8,9}/g, '')
        .replace(/(วันนี้|\d{1,2}[:.]\d{2}(\s?น\.)?|พรุ่งนี้|มะรืน|สัปดาห์หน้า|เดือนหน้า|\d{1,2}\s?(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s?\d{2})/g, '')
        .trim();

      appointments.push({
  id: Date.now(), // ⭐ สำคัญ
  dateObj: d.toISOString(),
  time: t,
  title,
  phone,
  phoneType: detectPhoneType(phone)
});

      saveAppointments();

      reply = `📌 เพิ่มนัดแล้วลูกพี่!!
📅 ${formatThaiDate(d)}
⏰ ${t} น.
📝 ${title || '-'}
☎️ ${phone || '-'} (${detectPhoneType(phone)})`;
    }
  }
}

  await axios.post(
  'https://api.line.me/v2/bot/message/reply',
  {
    replyToken: e.replyToken,
    messages: [
      {
        type: 'text',
        text: reply
      }
    ]
  },
  {
    headers: {
      'Content-Type': 'application/json',
     Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
    }
  }
);

  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`🤵 December พร้อมรับใช้ลูกพี่ ที่พอร์ต ${PORT}`);
});