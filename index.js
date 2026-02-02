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
const DATA_FILE = './data.json';

function loadAppointments() {
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const data = JSON.parse(raw);
      appointments = data.appointments || [];
      console.log(`📂 โหลดนัดจากไฟล์แล้ว ${appointments.length} รายการ`);
    } catch (err) {
      console.error('❌ อ่าน data.json ไม่ได้', err);
      appointments = [];
    }
  } else {
    appointments = [];
    console.log('📂 ยังไม่มี data.json เริ่มต้นด้วยนัดว่าง');
  }
}
function saveAppointments() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ appointments }, null, 2), 'utf8');
  console.log('💾 บันทึกนัดลงไฟล์แล้ว');
}
loadAppointments();

// ================== MUK ==================
const stressJokes = [
  'เครียดไปก็เท่านั้นลูกพี่!! เงินก็ยังไม่เพิ่ม 🤣',
  'งานหนักไม่กลัว กลัวเงินไม่เข้า 😎',
  'พักก่อนลูกพี่ หากินเหล้าซะ 😆',
  'ใจเย็น ๆ ลูกพี่ ถอนดีกว่า 😂',
  'เซาซะหาหลับหานอน ซ่างแม่มัน!! 😅'
];

const tiredReply = [
  'พักแป๊บเด้อ เดี๋ยวค่อยลุยต่อ!! 😴',
  'เซาซะติหล่ะ!! 😂'
 
];

const hungryReply = [
  'หิวข้าวก็ไปหาอะไรแดกสิลูกพี่ 🍚',
  'ข้าวกับก๋วยเตี๋ยว หรือจะกินเหล้า 🤤',
  'เอาแบบง่าย ๆ ไข่ต้มกับแจ่วบองก็ได้ลูกพี่ 😄'
];

// ================== DATE / PARSE ==================
const thaiMonths = {
  'ม.ค.': 0, 'ก.พ.': 1, 'มี.ค.': 2, 'เม.ย.': 3, 'พ.ค.': 4, 'มิ.ย.': 5,
  'ก.ค.': 6, 'ส.ค.': 7, 'ก.ย.': 8, 'ต.ค.': 9, 'พ.ย.': 10, 'ธ.ค.': 11
};

function formatThaiDate(d) {
  return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });
}

function parseTime(text) {
  const m = text.match(/(\d{1,2})[:.](\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null;
}

// รองรับ "14 ก.พ.69" (พ.ศ. 2569) => ค.ศ. 2026
function parseThaiDate(text) {
  const m = text.match(/(\d{1,2})\s?(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s?(\d{2})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = thaiMonths[m[2]];
  const yy = Number(m[3]);

  // สมมติเลข 2 หลักเป็น พ.ศ. 25yy
  const buddhistYear = 2500 + yy;
  const gregYear = buddhistYear - 543;

  const d = new Date(gregYear, month, day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseRelativeDate(text) {
  const d = getThaiNow();
  d.setHours(0, 0, 0, 0);

  if (text.includes('วันนี้')) {
    return d;
  }
  if (text.includes('พรุ่งนี้')) {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (text.includes('มะรืนนี้') || text.includes('มะรืน')) {
    d.setDate(d.getDate() + 2);
    return d;
  }
  if (text.includes('สัปดาห์หน้า')) {
    d.setDate(d.getDate() + 7);
    return d;
  }
  if (text.includes('เดือนหน้า')) {
    d.setMonth(d.getMonth() + 1);
    return d;
  }
  return null;
}

// ================== PHONE TYPE ==================
function detectPhoneType(phone) {
  if (!phone || phone === '-') return '-';
  if (/^0[689]\d{8}$/.test(phone)) return 'มือถือ';
  if (/^0\d{8,9}$/.test(phone)) return 'เบอร์บ้าน';
  return 'ไม่ทราบประเภท';
}

function extractPhone(text) {
  const p = text.match(/0\d{8,9}/)?.[0];
  return p || '-';
}

// ================== SORT HELPERS ==================
function appointmentDateTime(a) {
  const d = new Date(a.dateObj);
  const [h, m] = (a.time || '00:00').split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

function sortAppointmentsInPlace() {
  appointments.sort((a, b) => appointmentDateTime(a) - appointmentDateTime(b));
}

function cleanupPastAppointments() {
  const now = getThaiNow();
  const before = appointments.length;
  appointments = appointments.filter(a => appointmentDateTime(a) >= now);
  if (appointments.length !== before) {
    saveAppointments();
  }
}

// ================== PUSH ==================
async function push(text) {
  for (const id of userIds) {
    try {
      await axios.post(
        'https://api.line.me/v2/bot/message/push',
        { to: id, messages: [{ type: 'text', text }] },
        { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
      );
    } catch (err) {
      console.error('❌ push error:', err?.response?.data || err.message);
    }
  }
}

// ================== NOTIFY LOOP ==================
let lastMorningNotify = null;

setInterval(async () => {
  const now = getThaiNow();

  const thaiHour = Number(
    now.toLocaleString('en-US', {
      hour: '2-digit',
      hour12: false,
      timeZone: 'Asia/Bangkok'
    })
  );

  const thaiMinute = Number(
    now.toLocaleString('en-US', {
      minute: '2-digit',
      timeZone: 'Asia/Bangkok'
    })
  );

  console.log('[INTERVAL]', now.toString());
  const todayKey = now.toISOString().slice(0, 10);

  // 🧹 ลบนัดเก่า
  cleanupPastAppointments();

  // 🌅 สรุปนัด 04:00
  if (
    thaiHour === 4 &&
    thaiMinute === 0 &&
    now.getSeconds() < 5 &&
    lastMorningNotify !== todayKey
  ) {
    lastMorningNotify = todayKey;

    const todayAppointments = appointments
      .filter(a => {
        const d = new Date(a.dateObj);
        return (
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        );
      })
      .sort((a, b) => a.time.localeCompare(b.time));

    let text = '🌅 สรุปนัดวันนี้ลูกพี่!!\n';

    if (!todayAppointments.length) {
      text += 'วันนี้ไม่มีนัดครับ 😊';
    } else {
      todayAppointments.forEach((a, i) => {
        text += `\n${i + 1}. ⏰ ${a.time} 📝 ${a.title || '-'}`;
      });
    }

    // ✅ ส่ง LINE ตรงนี้เท่านั้น
    await push(text);
    console.log('📣 แจ้งเตือนสรุปนัดตี 4 แล้ว');
  }
}, 60_000); // ตรวจทุก 1 นาที

 setInterval(async () => {
  const now = getThaiNow();

  // 🔔 แจ้งเตือน 60/30/5 นาที
  for (const a of appointments) {
    const target = appointmentDateTime(a);
    const diffMin = Math.floor((target - now) / 60000);
    if (diffMin < 0) continue;

    a.n60 = a.n60 || false;
    a.n30 = a.n30 || false;
    a.n5  = a.n5  || false;
    a.n0  = a.n0  || false;

    if (diffMin <= 60 && diffMin >= 59 && !a.n60) {
      a.n60 = true;
      await push(`⏰ อีก 1 ชม. ${a.title || '-'}`);
    }

    if (diffMin <= 30 && diffMin >= 29 && !a.n30) {
      a.n30 = true;
      await push(`⏰ อีก 30 นาที ${a.title || '-'}`);
    }

    if (diffMin <= 5 && diffMin >= 4 && !a.n5) {
      a.n5 = true;
      await push(`⏰ อีก 5 นาที ${a.title || '-'}`);
    }

    if (diffMin <= 0 && !a.n0) {
      a.n0 = true;
      await push(`⏰ ถึงเวลาแล้ว ${a.title || '-'}`);
    }
  }
}, 60_000);

// ================== WEBHOOK ==================
app.post('/webhook', async (req, res) => {
  // ✅ ตอบ LINE ก่อน กัน timeout / echo
  res.sendStatus(200);

  const e = req.body.events?.[0];
  if (!e || e.type !== 'message' || !e.message || e.message.type !== 'text') return;

  const msg = e.message.text.trim();
  const replyToken = e.replyToken;
  const userId = e.source?.userId;

  if (userId && !userIds.has(userId)) {
    userIds.add(userId);
    saveUserIds();
  }

  // ทำความสะอาดนัดเก่า
  cleanupPastAppointments();

  let reply = '🤔ใจเย็นๆลูกพี่บ่ต้องฟ่าวค่อยๆพิมพ์';

  // ===== ทักทาย =====
  if (/สวัสดี/.test(msg)) {
    reply = '👋 สวัสดีลูกพี่!! มีอะไรให้รับใช้ 😄';
  }

  // ===== เครียด =====
  else if (msg.includes('เครียด')) {
    reply = stressJokes[Math.floor(Math.random() * stressJokes.length)];
  }

  // ===== เหนื่อย / ง่วง / หิวข้าว =====
  else if (msg.includes('เหนื่อย') || msg.includes('ง่วง')) {
    reply = tiredReply[Math.floor(Math.random() * tiredReply.length)];
  } else if (msg.includes('หิว')) {
    reply = hungryReply[Math.floor(Math.random() * hungryReply.length)];
  }

  // ===== ขอบคุณ =====
  else if (msg.includes('ขอบใจ') || msg.includes('ขอบคุณ')) {
    reply = 'บ่เป็นหยังดอกอ้ายหำแหล่ 😄';
  }

  // ===== คำสั่ง =====
  else if (msg === 'คำสั่ง' || msg === 'ช่วยเหลือ') {
    reply = `📌 คำสั่ง
• ดูนัด
• ลบนัด 1
• ว่าง (เช็คเวลาว่างวันนี้)
• เชคระบบ
• พิมพ์วันเวลา → เพิ่มนัด
ตัวอย่าง: วันนี้ 14:30 พบแพทย์ 089xxxxxxx
ตัวอย่าง: 14 ก.พ.69 08.00 น. พบแพทย์ 089xxxxxxx`;
  }

  // ===== ดูนัด =====
  else if (msg === 'ดูนัด' || msg === 'ดูรายการนัด') {
    if (!appointments.length) {
      reply = 'ยังไม่มีนัดเลยลูกพี่ 😊';
    } else {
      sortAppointmentsInPlace();
      reply = `📅 รายการนัดของลูกพี่!!\n\n` + appointments.map((a, i) => {
        const d = new Date(a.dateObj);
        const phone = a.phone || '-';
        const phoneType = a.phoneType || '-';
        return `${i + 1}. ${formatThaiDate(d)} ⏰ ${a.time} น.\n📝 ${a.title || '-'}\n☎️ ${phone} (${phoneType})`;
      }).join('\n\n');
    }
  }

  // ===== ลบนัด <เลขลำดับ> =====
  else if (/^ลบนัด\s*\d+/.test(msg)) {
    const num = parseInt(msg.replace(/\D/g, ''), 10);
    if (!appointments.length) {
      reply = '❌ ยังไม่มีนัดให้ลบเลยลูกพี่';
    } else {
      sortAppointmentsInPlace();
      if (num < 1 || num > appointments.length) {
        reply = `❌ ไม่มีนัดลำดับที่ ${num} ลูกพี่`;
      } else {
        const target = appointments[num - 1];
        appointments = appointments.filter(a => a.id !== target.id);
        saveAppointments();
        reply = `🗑️ ลบนัดเรียบร้อยลูกพี่!!\n📅 ${formatThaiDate(new Date(target.dateObj))}\n⏰ ${target.time} น.\n📝 ${target.title || '-'}`;
      }
    }
  }

  // ===== ว่าง (เช็คเวลาว่างวันนี้) =====
  else if (msg.includes('ว่าง')) {
    const now = getThaiNow();

    const pad = n => n.toString().padStart(2, '0');
    const nowTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

    const todayList = appointments
      .filter(a => {
        const d = new Date(a.dateObj);
        return d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear();
      })
      .sort((a, b) => a.time.localeCompare(b.time));

    if (!todayList.length) {
      reply = `📭 วันนี้ว่างหมดเลยลูกพี่ 😄\n🕒 ${nowTime} - 23:59`;
    } else {
      let free = [];
      let lastEnd = nowTime;

      for (const a of todayList) {
        if (lastEnd < a.time) {
          free.push(`${lastEnd} - ${a.time}`);
        }
        lastEnd = a.time; // สมมติ 1 นัด = ปิดช่วงที่เวลาเริ่มนัด
      }

      if (lastEnd < '23:59') free.push(`${lastEnd} - 23:59`);

      if (!free.length) {
        reply = '⛔ วันนี้ไม่มีเวลาว่างแล้วลูกพี่ 😅';
      } else {
        reply = `🕒 วันนี้ลูกพี่ว่างช่วง\n• ${free.join('\n• ')}`;
      }
    }
  }

  // ===== เชคระบบ =====
  else if (msg === 'เช็คระบบ' || msg === 'เชคระบบ') {
    const now = getThaiNow();
    const time = now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    reply = `🟢 ระบบปกติ
⏰ เวลาปัจจุบัน: ${time}
📅 นัดคงเหลือ: ${appointments.length} รายการ`;
  }

  // ===== เพิ่มนัด =====
  else {
    // รองรับ วันที่แบบไทย + วันนี้/พรุ่งนี้/มะรืน + เวลา
    const d = parseThaiDate(msg) || parseRelativeDate(msg);
    const t = parseTime(msg);

    if (d && t) {
      const now = getThaiNow();
      const isTodayKeyword = msg.includes('วันนี้');

      // ถ้าพิมพ์ "วันนี้ 09:00" แต่ตอนนี้เลย 09:00 ไปแล้ว -> ขยับเป็นวันพรุ่งนี้
      const [hour, minute] = t.split(':').map(Number);
      const appointmentDateTimeObj = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute, 0, 0);
      if (isTodayKeyword && appointmentDateTimeObj < now) {
        d.setDate(d.getDate() + 1);
      }

      const phone = extractPhone(msg);
      const phoneType = detectPhoneType(phone);

      // กันเวลาซ้ำในวันเดียวกัน
      const exists = appointments.some(a => {
        const ad = new Date(a.dateObj);
        return ad.getDate() === d.getDate() &&
          ad.getMonth() === d.getMonth() &&
          ad.getFullYear() === d.getFullYear() &&
          a.time === t;
      });

      if (exists) {
        reply = `⚠️ เวลานี้มีนัดอยู่แล้วลูกพี่!!\n📅 ${formatThaiDate(d)}\n⏰ ${t} น.`;
      } else {
        // ตัดสิ่งที่ไม่ใช่ชื่อเรื่องนัด
        let title = msg
          .replace(/0\d{8,9}/g, '')
          .replace(/(วันนี้|พรุ่งนี้|มะรืนนี้|มะรืน|สัปดาห์หน้า|เดือนหน้า)/g, '')
          .replace(/(\d{1,2})\s?(ม\.ค\.|ก\.พ\.|มี\.ค\.|เม\.ย\.|พ\.ค\.|มิ\.ย\.|ก\.ค\.|ส\.ค\.|ก\.ย\.|ต\.ค\.|พ\.ย\.|ธ\.ค\.)\s?(\d{2})/g, '')
          .replace(/(\d{1,2})[:.](\d{2})(\s?น\.)?/g, '')
          .trim();

        const a = {
          id: Date.now(),
          dateObj: d.toISOString(),
          time: t,
          title: title || '-',
          phone: phone || '-',
          phoneType: phoneType || '-',
          n60: false,
          n30: false,
          n5: false,
          n0: false
        };

        appointments.push(a);
        sortAppointmentsInPlace();
        saveAppointments();

        reply = `📌 เพิ่มนัดแล้วลูกพี่!!
📅 ${formatThaiDate(new Date(a.dateObj))}
⏰ ${a.time} น.
📝 ${a.title || '-'}
☎️ ${a.phone || '-'} (${a.phoneType || '-'})`;
      }
    }
  }

  // ✅ reply ครั้งเดียว
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
    console.error('❌ Reply error', err?.response?.data || err.message);
  }
});

app.listen(PORT, () => {
  const now = getThaiNow();
  console.log('🕒 Thai now =', now.toString());
  console.log(`🤵 December พร้อมรับใช้ลูกพี่ ที่พอร์ต ${PORT}`);
});