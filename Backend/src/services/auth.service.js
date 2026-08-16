const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const { oauth2Client, createOAuth2Client } = require('../config/google');
const prisma = require('../config/prisma');
const { encryptToken } = require('../utils/encryption');

// พ่อครัว (Service) ทำหน้าที่หลังบ้านทั้งหมด
exports.processGoogleCallback = async (code) => {
  // 1. แลกเปลี่ยน Code เป็น Token
  const { tokens } = await oauth2Client.getToken(code);
  const authClient = createOAuth2Client(tokens);

  // 2. ดึงข้อมูลผู้ใช้จาก Google
  const oauth2 = google.oauth2({ auth: authClient, version: 'v2' });
  const { data: userInfo } = await oauth2.userinfo.get();

  // 3. เข้ารหัส Token ก่อนบันทึกลง Database
  const encryptedAccessToken = encryptToken(tokens.access_token);
  const encryptedRefreshToken = tokens.refresh_token ? encryptToken(tokens.refresh_token) : undefined;

  const user = await prisma.user.upsert({
    where: { email: userInfo.email },
    update: {
      name: userInfo.name,
      picture: userInfo.picture,
      accessToken: encryptedAccessToken,
      ...(encryptedRefreshToken && { refreshToken: encryptedRefreshToken }),
    },
    create: {
      googleId: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      picture: userInfo.picture,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
    },
  });

  // 4. สร้าง JWT ของระบบเรา
  const userToken = jwt.sign(
    { id: user.id, email: user.email, name: user.name, picture: user.picture },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // คืนค่า Token กลับไปให้คนที่เรียกใช้งาน
  return userToken;
};