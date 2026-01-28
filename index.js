require('dotenv').config();
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');

const app = express();
const PORT = 3000;

/* =========================
   ENV VARIABLES
========================= */
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';

/* =========================
   ROUTES
========================= */

// หน้าแรก
app.get('/', (req, res) => {
  res.send('<a href="/auth/google">Login with Google</a>');
});

// เริ่ม Login Google
app.get('/auth/google', (req, res) => {
  const googleAuthURL =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    querystring.stringify({
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
    });

  res.redirect(googleAuthURL);
});

// Google redirect กลับมา
app.get('/oauth2callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    return res.send('No authorization code received');
  }

  try {
    // ขอ access token
    const tokenRes = await axios.post(
      'https://oauth2.googleapis.com/token',
      querystring.stringify({
        code: code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const accessToken = tokenRes.data.access_token;

    // ดึงข้อมูล user
    const userRes = await axios.get(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    res.json({
      message: 'Login success',
      user: userRes.data,
    });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.send('Google OAuth Error');
  }
});

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});