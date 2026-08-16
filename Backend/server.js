require('dotenv').config();
const express = require('express');
const cors = require('cors');

// นำเข้า Routes ต่างๆ
const authRoutes = require('./src/routes/auth.route');
const userRoutes = require('./src/routes/user.route');
const emailRoutes = require('./src/routes/email.route');
const calendarRoutes = require('./src/routes/calendar.route');
const settingRoutes = require('./src/routes/setting.route');
const draftRoutes = require('./src/routes/draft.route');
const summaryRoutes = require('./src/routes/summary.route');
const { startCron } = require('./src/cron/emailWatcher');

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], 
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MailMind Backend',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/emails', emailRoutes);
app.use('/api/threads', emailRoutes); 
app.use('/api/calendar', calendarRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/drafts', draftRoutes);
app.use('/api/summary', summaryRoutes);

// Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('[SERVER ERROR]', err.message || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error'
  });
});

const PORT = process.env.PORT || 5000;
const localAiBase = process.env.LOCAL_AI_BASE_URL || 'http://localhost:11434/v1';
const localAiModel = process.env.LOCAL_AI_MODEL || 'llama3.1:8b';

app.listen(PORT, () => {
  console.log(`\n==============================================`);
  console.log(`🚀 MailMind Backend is running on port ${PORT}`);
  console.log(`🤖 Local AI Endpoint: ${localAiBase}`);
  console.log(`🧠 Default Local Model: ${localAiModel}`);
  console.log(`🔗 Allowed CORS Origins: ${allowedOrigins.join(', ')}`);
  console.log(`==============================================\n`);
  
  startCron();
});