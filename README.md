# Dynamic AI Chatbot (Django + React + MySQL)

A white-label, text-and-voice chatbot you can deploy per client.

**Stack:** Django 5 + Django REST Framework, Django auth with JWT (SimpleJWT), MySQL, React (Vite).
**AI:** Google Gemini Flash by default (high chat limits, low cost). Switchable to any OpenAI-compatible API from the admin panel.

## What is included
- Register / login / logout using Django's user system, JWT access + refresh tokens
- ChatGPT-style chat: persistent history per user, context memory (last N messages), typing indicator, rename-on-first-message, delete chats
- Type or speak: microphone input (browser speech recognition) in English and Hindi, optional "read replies aloud"
- Sentiment detection on every user message; the bot adapts its tone to frustrated or happy users
- Thumbs up/down feedback on replies
- Automatic fallback message if the AI provider fails, with one retry
- Rate limiting (30 messages/min per user by default) to protect your AI quota
- Analytics dashboard for staff: users, chats, messages, daily volume, reply time, failure rate, sentiment, satisfaction
- White-label control in Django admin (Bot settings): bot name, logo, brand color, welcome message, system prompt, provider, model, temperature, memory length, voice on/off
- Users can only ever read their own chats; API keys live only in server environment variables
- Backend tests, Dockerfiles, docker-compose

## Run locally

### 1. Backend
```bash
cd backend
python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # then edit it
```
In `.env`: put your **new** `GEMINI_API_KEY` (get it at https://aistudio.google.com/apikey). Create the MySQL database first:
```sql
CREATE DATABASE chatbot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'chatbot'@'%' IDENTIFIED BY 'chatbot_password';
GRANT ALL ON chatbot.* TO 'chatbot'@'%';
```
(To try it without MySQL, set `DB_ENGINE=sqlite` in `.env`.)
```bash
python manage.py makemigrations chat
python manage.py migrate
python manage.py createsuperuser
python manage.py test chat
python manage.py runserver
```
Commit the generated `chat/migrations/` folder to git.

### 2. Frontend
```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```
Log in with your superuser to see **Analytics** and **Bot settings** in the sidebar.

## Deploy with Docker
```bash
cp backend/.env.example backend/.env     # set DJANGO_DEBUG=0, a long DJANGO_SECRET_KEY,
                                         # your domain in DJANGO_ALLOWED_HOSTS / CORS / CSRF, and the API key
docker compose up -d --build
docker compose exec backend python manage.py createsuperuser
```
Put it behind HTTPS (Caddy, Nginx + Let's Encrypt, or Cloudflare). Voice input only works on HTTPS or localhost.

## Onboarding a new client (about 10 minutes)
1. Deploy a fresh stack (or a new database) for the client.
2. Admin, Bot settings: set name, logo URL, brand color, welcome message.
3. Write the client's business details, tone and rules into **System prompt**.
4. Create their staff accounts; mark the owner as "staff" to unlock Analytics.

## API summary
| Method | Path | Purpose |
|---|---|---|
| POST | /api/auth/register/ | Create account, returns tokens |
| POST | /api/auth/login/ | Get access + refresh tokens |
| POST | /api/auth/refresh/ | Renew access token |
| GET | /api/auth/me/ | Current user |
| GET | /api/config/ | Public branding (no auth) |
| GET/POST | /api/conversations/ | List / create chats |
| GET/DELETE | /api/conversations/{id}/ | Open / delete a chat |
| POST | /api/conversations/{id}/send/ | Send a message, get the AI reply |
| POST | /api/messages/{id}/feedback/ | Thumbs up/down (value 1, -1, 0) |
| GET | /api/analytics/ | Staff only |

## Before you sell it
- Revoke the Gemini key that was hard-coded in your old notebook.
- Add a privacy policy and terms; chats are stored in the database. Tell clients and users this.
- Use a paid Gemini tier for production traffic; the free tier has low limits and may use data for training.
- Set up database backups and HTTPS.

## Roadmap (not built yet)
Streaming replies, document-based answers (RAG) from the client's own files, WhatsApp/Telegram/Slack connectors, multi-tenant single deployment, intent classification, email/password reset, per-client usage billing.
