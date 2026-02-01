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

// รองรับทั้งชื่อ ENV เดิม/ใหม่ (กันหลง)
const CHANNEL_ACCESS_TOKEN =
  process.env.CHANNEL_ACCESS_TOKEN || process.env.LINE_TOKEN;

if (!CHANNEL_ACCESS_TOKEN) {
  console.error('❌ Missing CHANNEL_ACCESS_TOKEN (หรือ LINE_TOKEN)');
}

// ================== USER IDS ==================
const USER_IDS_FILE = './userIds.json';
let userIds = new Set();

if (fs.existsSync(USER_IDS_FILE)) {
  try {
    userIds = new Set(JSON.parse(fs.readFileSync(USER_IDS_FILE, 'utf8')));
  } catch (err) {
    console.error('❌ อ่าน userIds.json ไม่ได้', err.message);
  }
}
function saveUserIds() {
  fs.writeFileSync(USER_IDS_FILE, JSON.stringify([...userIds], null, 2));
}

// ================== DATA ==================
let appointments = [];

function loadAppointments() {
  if (fs.existsSync('data.json')) {
    try {
      const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
      appointments = data.appointments || [];
    } catch (err) {
      console.error('❌ อ่าน data.json ไม่ได้', err.message);
      appointments = [];
    }
  } else {
    appointments = [];
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

const tiredReplies = [
  'ไปนอนก่อนลูกพี่ 😴',
  'พักแป๊บเด้อ เดี๋ยวค่อยลุยต่อ 💪',
  'ง่วงก็พักก่อน ลูกพี่ไม่ต้องฝืน 😅'
];

const hungryReplies = [
  'หิวข้าวก็ไปหาอะไรกินก่อนลูกพี่ 🍚',
  'กินข้าวก่อนเด้อ เดี๋ยวหมดแรง 🤤',
  'เอาแบบง่าย ๆ ไข่ต้ม/ข้าวต้มก็ได้ลูกพี่ 😄'
];

// ================== DATE / TIME ==================
function pad2(n) {
  return n.toString().padStart(2, '0');
}

function formatThaiDate(d) {
  return d.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'short',
    year: '2-digit'
  });
}

function parseTime(text) {
  // รองรับ 9:00 / 09:00 / 9.00 / 09.00
  const m = text.match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${pad2(hh)}:${pad2(mm)}`;
}

function parseRelativeDate(text) {
  const d = getThaiNow();
  d.setHours(0, 0, 0, 0);

  if (text.includes('วันนี้')) return d;
  if (text.includes('พรุ่งนี้')) {
    d.setDate(d.getDate() + 1);
    return d;
  }
  if (text.includes('มะรืนนี้') || text.includes('มะรืน')) {
    d.setDate(d.getDate() + 2);
    return d;
  }
  return null;
}

function extractPhone(text) {
  const m = text.match(/0\d{8,9}/);
  return m ? m[0] : '';
}

function detectPhoneType(phone) {
  if (!phone) return '-';
  if (/^0[689]\d{8}$/.test(phone)) return 'มือถือ';
  if (/^0\d{8,9}$/.test(phone)) return 'เบอร์บ้าน';
  return 'ไม่ทราบประเภท';
}

function normalizeTitle(text) {
  let t = text;
  t = t.replace(/0\d{8,9}/g, '');
  t = t.replace(/(\d{1,2}[:.]\d{2})/g, '');
  t = t.replace(/(วันนี้|พรุ่งนี้|มะรืนนี้|มะรืน)/g, '');
  t = t.replace(/\s+/g, ' ').trim();
  return t;
}

function appointmentDateTime(a) {
  const d = new Date(a.dateObj);
  const [h, m] = a.time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

function cleanupPastAppointments() {
  const now = getThaiNow();
  const before = appointments.length;
  appointments = appointments.filter(a => appointmentDateTime(a) >= now);
  if (appointments.length !== before) saveAppointments();
}

function sortAppointmentsInPlace() {
  appointments.sort((a, b) => appointmentDateTime(a) - appointmentDateTime(b));
}

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function makeTodayList(now) {
  return appointments
    .filter(a => isSameDay(new Date(a.dateObj), now))
    .sort((a, b) => a.time.localeCompare(b.time));
}

// ================== PUSH (แจ้งเตือน) ==================
async function push(text) {
  for (const id of userIds) {
    await axios.post(
      'https://api.line.me/v2/bot/message/push',
      { to: id, messages: [{ type: 'text', text }] },
      { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
    );
  }
}

// ================== NOTIFY LOOP ==================
let lastMorningNotifyKey = null;

setInterval(async () => {
  try {
    cleanupPastAppointments();

    const now = getThaiNow();
    const todayKey = now.toISOString().slice(0, 10);

    // 04:00 สรุปนัดวันนี้
    if (
      now.getHours() === 4 &&
      now.getMinutes() === 0 &&
      now.getSeconds() < 5 &&
      lastMorningNotifyKey !== todayKey
    ) {
      lastMorningNotifyKey = todayKey;

      const todayList = makeTodayList(now);
      let text = '🌅 สรุปนัดวันนี้ลูกพี่!!\n';

      if (!todayList.length) {
        text += 'วันนี้ไม่มีนัดครับ 😊';
      } else {
        todayList.forEach((a, i) => {
          text += `\n${i + 1}. ⏰ ${a.time} น. 📝 ${a.title || '-'}`;
        });
      }

      await push(text);
    }

    // แจ้งเตือนก่อนนัด 60/30/5 และถึงเวลา
    for (const a of appointments) {
      const target = appointmentDateTime(a);
      const diffMin = Math.floor((target - now) / 60000);
      if (diffMin < 0) continue;

      if (diffMin <= 60 && diffMin >= 59 && !a.n60) {
        a.n60 = true;
        await push(`⏰ อีก 1 ชั่วโมง\n📝 ${a.title || '-'}`);
        saveAppointments();
      }

      if (diffMin <= 30 && diffMin >= 29 && !a.n30) {
        a.n30 = true;
        await push(`⏰ อีก 30 นาที\n📝 ${a.title || '-'}`);
        saveAppointments();
      }

      if (diffMin <= 5 && diffMin >= 4 && !a.n5) {
        a.n5 = true;
        await push(`⏰ อีก 5 นาที\n📝 ${a.title || '-'}`);
        saveAppointments();
      }

      if (diffMin == 0 && !a.n0) {
        a.n0 = true;
        await push(`⏰ ถึงเวลานัดแล้ว\n📝 ${a.title || '-'}`);
        saveAppointments();
      }
    }
  } catch (err) {
    console.error('❌ notify loop error:', err.message);
  }
}, 60000);

// ================== WEBHOOK ==================
app.post('/webhook', async (req, res) => {
  // ✅ ตอบ LINE ก่อน กัน timeout / echo
  res.sendStatus(200);

  const e = req.body.events?.[0];
  if (!e || e.type !== 'message' || e.message?.type !== 'text') return;

  const msg = (e.message.text || '').trim();
  const replyToken = e.replyToken;
  const userId = e.source?.userId;

  if (userId && !userIds.has(userId)) {
    userIds.add(userId);
    saveUserIds();
  }

  cleanupPastAppointments();

  let reply = '🤔 ใจเย็น ๆ ลูกพี่ ค่อย ๆ พิมพ์มา';

  if (/สวัสดี/.test(msg)) {
    reply = '👋 สวัสดีลูกพี่!! มีอะไรให้รับใช้ 😄';
  } else if (msg.includes('เหนื่อย') || msg.includes('ง่วง')) {
    reply = tiredReplies[Math.floor(Math.random() * tiredReplies.length)];
  } else if (msg.includes('หิวข้าว')) {
    reply = hungryReplies[Math.floor(Math.random() * hungryReplies.length)];
  } else if (msg.includes('เครียด')) {
    reply = stressJokes[Math.floor(Math.random() * stressJokes.length)];
  } else if (msg.includes('ขอบใจ') || msg.includes('ขอบคุณ')) {
    reply = 'บ่เป็นหยังดอกลูกพี่ 😄';
  } else if (msg === 'คำสั่ง' || msg === 'ช่วยเหลือ') {
    reply = `📌 คำสั่ง
• ดูนัด
• ลบนัด 1
• วันนี้ว่างไม๊ / พิมพ์มีคำว่า "ว่าง"
• เชคระบบ
• พิมพ์: วันนี้/พรุ่งนี้/มะรืน + เวลา + รายละเอียด (+ เบอร์ได้)
ตัวอย่าง: วันนี้ 14:30 ไปหาหมอ 089xxxxxxx`;
  } else if (msg === 'ดูนัด') {
    if (!appointments.length) {
      reply = 'ยังไม่มีนัดเลยลูกพี่ 😊';
    } else {
      sortAppointmentsInPlace();
      reply = `📅 รายการนัดของลูกพี่!!\n\n${appointments
        .map((a, i) => {
          const d = new Date(a.dateObj);
          const phone = a.phone || '-';
          const phoneType = a.phoneType || '-';
          return `${i + 1}. ${formatThaiDate(d)} ⏰ ${a.time} น.\n📝 ${
            a.title || '-'
          }\n☎️ ${phone} (${phoneType})`;
        })
        .join('\n\n')}`;
    }
  } else if (/^ลบนัด\s*\d+/.test(msg)) {
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
        reply = `🗑️ ลบนัดเรียบร้อยลูกพี่!!\n📅 ${formatThaiDate(
          new Date(target.dateObj)
        )}\n⏰ ${target.time} น.\n📝 ${target.title || '-'}`;
      }
    }
  } else if (msg.includes('ว่าง')) {
    const now = getThaiNow();
    const nowTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    const todayList = makeTodayList(now);

    if (!todayList.length) {
      reply = `📭 ตอนนี้ถึงสิ้นวันว่างหมดเลยลูกพี่ 😄\n🕒 ${nowTime} - 23:59`;
    } else {
      let free = [];
      let lastEnd = nowTime;

      for (const a of todayList) {
        if (lastEnd < a.time) free.push(`${lastEnd} - ${a.time}`);
        lastEnd = a.time;
      }
      if (lastEnd < '23:59') free.push(`${lastEnd} - 23:59`);

      if (!free.length) reply = '⛔ วันนี้ไม่มีเวลาว่างแล้วลูกพี่ 😅';
      else reply = `🕒 วันนี้ลูกพี่ว่างช่วง\n• ${free.join('\n• ')}`;
    }
  } else if (msg === 'เช็คระบบ' || msg === 'เชคระบบ') {
    const now = getThaiNow();
    const time = now.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit'
    });
    reply = `🟢 ระบบปกติ\n⏰ เวลาปัจจุบัน: ${time}\n📅 นัดคงเหลือ: ${appointments.length} รายการ`;
  } else {
    // ===== เพิ่มนัด (วันนี้/พรุ่งนี้/มะรืน + เวลา) =====
    const d = parseRelativeDate(msg);
    const t = parseTime(msg);

    if (d && t) {
      const now = getThaiNow();
      const [hh, mm] = t.split(':').map(Number);
      const apDT = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        hh,
        mm,
        0,
        0
      );

      // ถ้าพิมพ์ "วันนี้" แต่เวลาเลยแล้ว -> ขยับเป็นพรุ่งนี้
      if (msg.includes('วันนี้') && apDT < now) {
        apDT.setDate(apDT.getDate() + 1);
        d.setDate(d.getDate() + 1);
      }

      const phone = extractPhone(msg);
      const phoneType = detectPhoneType(phone);
      const title = normalizeTitle(msg);

      const exists = appointments.some(a => {
        const ad = new Date(a.dateObj);
        return (
          ad.getFullYear() === d.getFullYear() &&
          ad.getMonth() === d.getMonth() &&
          ad.getDate() === d.getDate() &&
          a.time === t
        );
      });

      if (exists) {
        reply = `⚠️ เวลานี้มีนัดอยู่แล้วลูกพี่!!\n📅 ${formatThaiDate(
          d
        )}\n⏰ ${t} น.`;
      } else {
        appointments.push({
          id: Date.now(),
          dateObj: d.toISOString(),
          time: t,
          title,
          phone: phone || '-',
          phoneType: phone ? phoneType : '-'
        });

        sortAppointmentsInPlace();
        saveAppointments();

        reply = `✅ เพิ่มนัดแล้วลูกพี่!!\n📅 ${formatThaiDate(
          d
        )}\n⏰ ${t} น.\n📝 ${title || '-'}\n☎️ ${phone || '-'} (${
          phone ? phoneType : '-'
        })`;
      }
    }
  }

  try {
    await axios.post(
      'https://api.line.me/v2/bot/message/reply',
      { replyToken, messages: [{ type: 'text', text: reply }] },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`
        }
      }
    );
  } catch (err) {
    console.error('❌ Reply error', err.response?.data || err.message);
  }
});

app.listen(PORT, () => {
  console.log(`🤵 December พร้อมรับใช้ลูกพี่ ที่พอร์ต ${PORT}`);
});
