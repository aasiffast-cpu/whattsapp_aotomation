# 🤖 WhatsApp AI Bot — Powered by Google Gemini

Automatically replies to your WhatsApp messages using Google's Gemini AI. Responses are natural and human-like — nobody can tell it's a bot!

## ✨ Features
- Auto-replies to all incoming WhatsApp messages
- Shows "typing..." indicator before replying
- Uses Gemini 1.5 Flash for fast, natural responses
- Saves WhatsApp session (no QR scan needed every time)
- One-click launcher with `Launch_Bot.bat`

---

## 🚀 Setup After Cloning

### Step 1 — Install Node.js
Download from [nodejs.org](https://nodejs.org/) and install.

### Step 2 — Install Dependencies
```bash
npm install
```

### Step 3 — Create your `.env` file
Create a file named `.env` in the project root and add:
```
GEMINI_API_KEY=your_gemini_api_key_here
```
Get your free API key from [Google AI Studio](https://aistudio.google.com/).

### Step 4 — Run the Bot
```bash
node index.js
```
Or double-click **`Launch_Bot.bat`**

### Step 5 — Scan QR Code
- A QR code image (`SCAN_THIS_QR_CODE.png`) will open automatically
- Open WhatsApp → ⋮ → Linked Devices → Link a Device → Scan

### Step 6 — Done! 🎉
The bot will now auto-reply to all messages.

---

## 📁 Project Structure
```
whatsapp-ai-bot/
├── index.js          # Main bot logic
├── package.json      # Dependencies
├── Launch_Bot.bat    # One-click launcher (Windows)
├── .env              # Your API key (DO NOT share)
└── .gitignore        # Protects secrets from GitHub
```

---

## ⚠️ Important Notes
- Keep the terminal/bot window **open** while running
- Session is saved locally — no QR scan needed on restart
- **Never share your `.env` file or API key publicly**
