# MailMind - Smart Email Assistant with Local AI Auto-Scheduling

"MailMind is an intelligent, privacy-focused email assistant web application designed to streamline appointment scheduling. By integrating directly with Gmail and Google Calendar, it utilizes **100% Local Generative AI (`llama3.1:8b` via Ollama)** to analyze incoming emails, detect appointment requests, check calendar availability, and automatically generate smart plain-text draft replies (Accept or Reschedule). Developed with a **Next.js** frontend and an **Express.js** backend, powered by **Prisma ORM** and a **PostgreSQL** database."

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Local AI Setup](#local-ai-setup)
- [External APIs Used](#external-apis-used)
- [Prerequisites](#prerequisites)
- [Security & Privacy](#security--privacy)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the Application](#running-the-application)
- [API Endpoints](#api-endpoints)
- [License](#license)
- [Contact](#contact)

---

## Features

- **Google Integration:** Seamless authentication via Google OAuth 2.0 with scopes for Gmail and Google Calendar.
- **100% Local AI Processing:** Powered by **Ollama (`llama3.1:8b`)**, ensuring complete privacy without sending email data to third-party cloud AI APIs.
- **Automated Email Fetching:** Background cron job (every 10 minutes) to automatically fetch unread emails and filter appointment requests.
- **AI-Powered Data Extraction:** Extracts appointment details (Date, Time, Location, Subject, Priority) and handles Thai Buddhist Era (B.E.) to Gregorian year conversion with Thailand (+07:00) timezone offset.
- **Smart Auto-Drafting:** Generates natural Thai plain-text email replies to accept appointments or propose new times based on user working hours and calendar conflicts.
- **Calendar & Gmail Auto-Sync:** Upon user approval, sends the email reply via Gmail API and automatically creates the event in Google Calendar.
- **Human-in-the-Loop Workflow:** All generated drafts remain in `PENDING` status for user review. Rejecting a draft permanently purges it from the database.
- **AI Schedule Summary:** Generates daily, weekly, or monthly schedule summaries.

---

## Tech Stack

- **Frontend:** Next.js (App Router), React 19, Tailwind CSS, Lucide Icons
- **Backend:** Express.js, Node.js
- **Local AI Engine:** Ollama (`llama3.1:8b` via OpenAI Compatible API)
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Background Jobs:** `node-cron`, `p-limit`
- **Authentication:** Google OAuth 2.0 & JSON Web Tokens (JWT)
- **Package Manager:** pnpm

---

## Local AI Setup

MailMind runs on Ollama for local LLM inference.

1. Download and install Ollama from [ollama.com](https://ollama.com).
2. Pull the recommended model:
   ```bash
   ollama pull llama3.1:8b
   ```
3. Ensure the Ollama server is running locally at `http://localhost:11434`.

---

## External APIs Used

**Google Cloud APIs:**
- Google OAuth 2.0 API
- Gmail API (`gmail.readonly`, `gmail.send`)
- Google Calendar API (`calendar.events`)

---

## Prerequisites

- Node.js v18+
- pnpm (recommended) or npm
- PostgreSQL database (or Docker Compose)
- Ollama installed with `llama3.1:8b`
- Google Cloud Console Credentials (Client ID & Client Secret)

---

## Security & Privacy

- **100% Local AI:** No email contents or personal schedule data leave your environment.
- **Token Management:** Google Access Tokens and Refresh Tokens are securely managed.
- **Keywords Pre-filtering:** Local keyword filtering reduces CPU/GPU processing overhead.

---

## Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/MailMind.git
   cd MailMind
   ```

2. **Start PostgreSQL via Docker Compose:**
   ```bash
   docker compose up -d --build
   ```

3. **Install Backend dependencies:**
   ```bash
   cd Backend
   pnpm install
   ```

4. **Install Frontend dependencies:**
   ```bash
   cd ../Frontend
   pnpm install
   ```

---

## Environment Variables

### Backend (`Backend/.env`)

```env
PORT=5000
FRONTEND_URL=http://localhost:3000

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:5000/api/auth/google/callback

# Security Keys
JWT_SECRET=your_jwt_secret_key
ENCRYPTION_SECRET=your_32_byte_aes_256_secret_key

# PostgreSQL Connection
DATABASE_URL="postgresql://mailmind_user:mailmind_password@localhost:5432/mailmind_db?schema=public"

# Local AI (Ollama) Settings
LOCAL_AI_BASE_URL="http://localhost:11434/v1"
LOCAL_AI_MODEL="llama3.1:8b"

# Console observability (safe defaults)
LOG_LEVEL=info
LOG_SENSITIVE_CONTENT=false
```

For a short-lived, local end-to-end appointment trace—including email details, AI case and
parameter summaries, and raw AI diagnostics when parsing fails—set both `LOG_LEVEL=debug`
and `LOG_SENSITIVE_CONTENT=true`. Turn sensitive logging off after debugging; credentials
and authorization secrets remain redacted in either mode.

### Frontend (`Frontend/.env.local`)

```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
```

---

## Database Setup

Navigate to the `Backend` directory:
```bash
cd Backend
```

Generate Prisma Client & Run migrations:
```bash
npx prisma generate
npx prisma migrate dev --name init
```

---

## Running the Application

1. **Start Ollama Server:**
   ```bash
   ollama serve
   ```

2. **Start Backend Server:**
   ```bash
   cd Backend
   pnpm run dev # Starts Express server on http://localhost:5000
   ```

3. **Start Frontend Web App:**
   ```bash
   cd Frontend
   pnpm run dev # Starts Next.js on http://localhost:3000
   ```

---

## API Endpoints

### Authentication
- `GET /api/auth/google` – Redirect to Google OAuth consent screen.
- `GET /api/auth/google/callback` – Google OAuth callback handler.
- `GET /api/user/me` – Get current logged-in user profile.

### Settings & Local AI
- `GET /api/settings` – Get user application settings.
- `PUT /api/settings` – Update user settings (working hours, tone, signature).
- `POST /api/settings/test-key` – Test connection to Local AI Server (Ollama).
- `GET /api/settings/models` – Fetch available models from Ollama server.
- `PATCH /api/settings/toggle-cron` – Toggle automated background email processing.

### Emails & Threads
- `GET /api/emails` – Fetch recent emails from Gmail.
- `POST /api/emails/sync` – Manually trigger immediate email sync & draft generation.
- `POST /api/emails/mark-read` – Mark an email message as read.
- `GET /api/threads/:threadId` – Get full email thread messages.
- `POST /api/emails/threads/:threadId` – Send a direct reply to an email thread.

### Drafts
- `GET /api/drafts` – List pending AI-generated drafts (`PENDING`).
- `POST /api/drafts/generate` – On-demand AI draft generation for a specific thread.
- `POST /api/drafts/:id/send` – Approve draft, send email via Gmail API, and insert event to Google Calendar (if action is `ACCEPT`).
- `POST /api/drafts/:id/reject` – Reject and delete a draft from the database.

### Calendar & Summaries
- `GET /api/calendar` – List upcoming events from Google Calendar.
- `GET /api/summary` – Generate AI-powered daily, weekly, or monthly schedule summaries.

---

## License

This project is licensed under the MIT License.

---

## Contact

For questions or feedback, reach out to the development team:
- **Email:** adithep.ma@kkumail.com
- **Email:** chetsada.k@kkumail.com
