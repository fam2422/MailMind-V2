const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

let warnedMissingSecret = false;

// ดึงหรือแปลง Secret Key ให้มีความยาว 32 bytes (256 bits) เสมอด้วย SHA-256
const getSecretKey = () => {
  const secret = process.env.ENCRYPTION_SECRET || process.env.JWT_SECRET || 'mailmind-default-fallback-key-32b!';
  if (!process.env.ENCRYPTION_SECRET && !warnedMissingSecret) {
    console.warn('⚠️ [SECURITY WARNING] ENCRYPTION_SECRET is not set in environment variables. Using fallback key. Please configure ENCRYPTION_SECRET in .env for production security.');
    warnedMissingSecret = true;
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
};

// ฟังก์ชันเข้ารหัส Token เป็นสตริงรูปแบบ enc:v1:<iv>:<authTag>:<encrypted>
exports.encryptToken = (token) => {
  if (!token) return null;
  try {
    const key = getSecretKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(String(token), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('Token Encryption Error:', error.message);
    return token;
  }
};

// ฟังก์ชันถอดรหัส Token พร้อมรองรับ Plaintext เดิม (Backward Compatibility)
exports.decryptToken = (tokenStr) => {
  if (!tokenStr) return null;
  if (!String(tokenStr).startsWith('enc:v1:')) {
    // กรณีเป็น Plaintext Token ดั้งเดิมใน Database คืนค่าเดิมได้ทันที
    return tokenStr;
  }

  try {
    const parts = String(tokenStr).split(':');
    if (parts.length !== 5) return tokenStr;

    const ivHex = parts[2];
    const authTagHex = parts[3];
    const encryptedKey = parts[4];

    const key = getSecretKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Token Decryption Error:', error.message);
    return tokenStr;
  }
};

// ฟังก์ชันสำหรับเข้ารหัสทั่วไป (Legacy compatibility)
exports.encrypt = (text) => {
  if (!text) return null;
  const key = getSecretKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return {
    encryptedKey: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag,
  };
};

// ฟังก์ชันสำหรับถอดรหัสทั่วไป (Legacy compatibility)
exports.decrypt = (encryptedKey, ivHex, authTagHex) => {
  if (!encryptedKey || !ivHex || !authTagHex) return null;
  try {
    const key = getSecretKey();
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

    let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('General Decryption Error:', error.message);
    return null;
  }
};