const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { google } = require('googleapis');

const app = express();
app.use(express.json());

/* ================== CONFIG ================== */
const PORT = process.env.PORT || 8080;
const CHANNEL_ACCESS_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;

/* ================== DATA ================== */
let appointments = [];
if (fs.existsSync('data.json')) {
  appointments = JSON.parse(fs.readFileSync('data.json', 'utf8'));
}

/* ================== GOOGLE SHEET ================== */
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT),
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

async function addAppointmentToSheet(a) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: 'ชีต1!A:G',
    valueInputOption: 'RAW',
    requestBody: {
      values: [[
        a.id,
        a.date,
        a.time,
        a.title,
        a.phone || '-',
        a.phoneType || '-',
        new Date().toISOString()
      ]]
    }
  });
}

/* ================== HELPERS ================== */
function saveData() {
  fs.writeFileSync('data.json', JSON.stringify(appointments, null, 2));
}

function replyLINE(replyToken, text) {
  return axios.post(
    'https://api.line.me/v2/bot/message/reply',
    {
      replyToken,
      messages: [{ type: 'text', text }]
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: Bearer ${CHANNEL_ACCESS_TOKEN}
      }
    }
  );
}

/* ================== WEBHOOK ================== */
app.post('/webhook', async (req, res) => {
  try {
    const e = req.body.events?.[0];
    if (!e || !e.replyToken) return res.sendStatus(200);

    const msg = e.message?.text || '';

    // ✅ ตอบ LINE ก่อน (ห้าม block)
    await replyLINE(e.replyToken, '⏳ กำลังประมวลผลนัด...');
    res.sendStatus(200);

    /* ---------- LOGIC เดิมทั้งหมด ---------- */
    if (msg === 'ดูนัด') {
      if (!appointments.length) {
        await replyLINE(e.replyToken, '📭 ยังไม่มีนัด');
        return;
      }
      const text = appointments
        .map((a, i) => `${i + 1}. ${a.date} ${a.time} ${a.title}`)
        .join('\n');
      await replyLINE(e.replyToken, text);
      return;
    }

    // เพิ่มนัด (ตัวอย่างย่อ)
    const newAppointment = {
      id: Date.now(),
      date: 'วันนี้',
      time: '20:00',
      title: msg,
      phone: '',
      phoneType: ''
    };

    appointments.push(newAppointment);
    saveData();

    // ✅ Google Sheet async ไม่ block
    addAppointmentToSheet(newAppointment)
      .then(() => console.log('✅ บันทึก Google Sheet สำเร็จ'))
      .catch(err => console.error('❌ Google Sheet error', err));

    await replyLINE(e.replyToken, '✅ เพิ่มนัดเรียบร้อยแล้ว');

  } catch (err) {
    console.error('Webhook error:', err);
    res.sendStatus(200);
  }
});

/* ================== NOTIFY ================== */
setInterval(() => {
  console.log('⏰ setInterval ทำงาน', new Date().toISOString());
  // (แจ้งเตือน 60 / 30 / 5 นาที ตาม logic เดิม)
}, 60000);

/* ================== START ================== */
app.listen(PORT, () => {
  console.log(`🚀 LINE Bot running on port ${PORT}`);
});