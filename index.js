const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');
const googleTTS = require('google-tts-api');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
require('dotenv').config();

// Set ffmpeg and ffprobe paths
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Initialize Groq AI
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Health Check Server for Railway
const http = require('http');
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WhatsApp Bot is running!\n');
}).listen(port, '0.0.0.0', () => {
    console.log(`📡 Health-check server listening on port ${port}`);
});

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-software-rasterizer'
        ]
    }
});

// QR Code handling
client.on('qr', async (qr) => {
    console.log('\n--- SCAN THIS QR CODE WITH YOUR WHATSAPP ---');
    qrcode.generate(qr, { small: true });
    
    const qrImagePath = path.join(__dirname, 'SCAN_THIS_QR_CODE.png');
    await QRCode.toFile(qrImagePath, qr, {
        color: { dark: '#000000', light: '#FFFFFF' },
        width: 400,
        margin: 2
    });
    console.log(`✅ QR Code saved: ${qrImagePath}`);
    const { exec } = require('child_process');
    exec(`start "" "${qrImagePath}"`);
});

client.on('ready', () => {
    const qrImagePath = path.join(__dirname, 'SCAN_THIS_QR_CODE.png');
    if (fs.existsSync(qrImagePath)) fs.unlinkSync(qrImagePath);
    console.log('\n✅ WhatsApp Bot is Ready! (Voice & Language Fix Applied)');
});

// Handle Incoming Calls
client.on('incoming_call', async (call) => {
    console.log(`📞 Call from ${call.from} - Replying as Asif...`);
    await client.sendMessage(call.from, "Asif bol raha hun. Abhi busy hun call attend nahi kar sakta, driving kar raha hun ya kahin phansa hun. Please voice note ya message bhej dein, main foran dekh kar reply karunga. 🙏");
});

// Handle Incoming Messages
client.on('message_create', async (msg) => {
    console.log(`📡 Message event: from ${msg.from} (fromMe: ${msg.fromMe})`);
    
    const from = msg.from;
    const isRealPerson = (from.endsWith('@c.us') || from.endsWith('@lid')) &&
                         !from.includes('@newsletter') &&
                         from !== 'status@broadcast';

    if (!isRealPerson) {
        console.log(`⚠️ Ignored: Not a real person chat.`);
        return;
    }
    
    if (msg.fromMe) {
        console.log(`⚠️ Ignored: Message is from the bot account itself.`);
        return;
    }

    console.log(`🔍 Processing message from ${from}... (Type: ${msg.type}, hasMedia: ${msg.hasMedia})`);
    let userMessage = msg.body;

    // VOICE MESSAGE HANDLING (STT)
    const isIncomingVoice = (msg.type === 'audio' || msg.type === 'voice' || msg.type === 'ptt');
    if (msg.hasMedia && isIncomingVoice) {
        console.log(`🎙️ Voice note from ${from}. Transcribing...`);
        try {
            const media = await msg.downloadMedia();
            const tempInput = path.join(__dirname, `temp_in_${Date.now()}.ogg`);
            fs.writeFileSync(tempInput, Buffer.from(media.data, 'base64'));

            const transcription = await groq.audio.transcriptions.create({
                file: fs.createReadStream(tempInput),
                model: "whisper-large-v3",
                language: "ur",
            });

            userMessage = transcription.text;
            console.log(`📝 Transcribed: "${userMessage}"`);
            if (fs.existsSync(tempInput)) fs.unlinkSync(tempInput);
        } catch (err) {
            console.error('❌ Transcription Error:', err.message);
            return;
        }
    }

    if (!userMessage || userMessage.trim() === '') return;
    console.log(`📩 Message from ${from}: "${userMessage}"`);

    try {
        const chat = await msg.getChat();
        const history = await chat.fetchMessages({ limit: 10 });
        const conversationHistory = history
            .filter(m => m.body && m.body.trim() !== '')
            .map(m => ({
                role: m.fromMe ? 'assistant' : 'user',
                content: m.body
            }));

        await new Promise(res => setTimeout(res, 2000));

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `Your name is ASIF. You are a real person from Pakistan chatting on WhatsApp.
STRICT RULES:
1. Always talk as ASIF. 
2. Match the user's language EXACTLY (Roman Urdu -> Roman Urdu, Urdu Script -> Urdu Script, English -> English).
3. Keep replies very SHORT and to the point (1-2 sentences max).
4. NEVER reveal you are an AI. You are a human named Asif.`
                },
                ...conversationHistory
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.8,
        });

        const responseText = completion.choices[0]?.message?.content || "Theek hai!";

        // CONDITIONAL REPLY: Voice for Voice, Text for Text
        if (isIncomingVoice) {
            console.log(`🗣️ Generating detailed voice reply...`);
            try {
                const cleanText = responseText.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '');
                const isUrduScript = /[\u0600-\u06FF]/.test(cleanText);
                const ttsLang = isUrduScript ? 'ur' : 'en-US';

                const chunks = googleTTS.getAllAudioUrls(cleanText, {
                    lang: ttsLang,
                    slow: false,
                    host: 'https://translate.google.com',
                });

                const tempMp3s = [];
                const tempOgg = path.join(__dirname, `temp_${Date.now()}.ogg`);
                const finalOgg = path.join(__dirname, `final_${Date.now()}.ogg`);

                for (let i = 0; i < chunks.length; i++) {
                    const tempMp3 = path.join(__dirname, `temp_${Date.now()}_${i}.mp3`);
                    const response = await axios.get(chunks[i].url, { responseType: 'arraybuffer' });
                    fs.writeFileSync(tempMp3, Buffer.from(response.data));
                    tempMp3s.push(tempMp3);
                }

                await new Promise((resolve, reject) => {
                    let command = ffmpeg();
                    tempMp3s.forEach(file => { command = command.input(file); });
                    command.on('end', resolve).on('error', reject).mergeToFile(tempOgg, __dirname);
                });

                await new Promise((resolve, reject) => {
                    ffmpeg(tempOgg).toFormat('ogg').audioCodec('libopus').on('end', resolve).on('error', reject).save(finalOgg);
                });

                const media = MessageMedia.fromFilePath(finalOgg);
                await client.sendMessage(from, media, { sendAudioAsVoice: true });
                console.log(`✅ Sent full voice reply.`);

                tempMp3s.forEach(f => { if(fs.existsSync(f)) fs.unlinkSync(f); });
                if (fs.existsSync(tempOgg)) fs.unlinkSync(tempOgg);
                if (fs.existsSync(finalOgg)) fs.unlinkSync(finalOgg);
            } catch (ttsErr) {
                console.error('❌ Voice Error:', ttsErr.message);
                await msg.reply(responseText);
            }
        } else {
            await msg.reply(responseText);
            console.log(`✅ Sent text reply.`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
});

console.log('Starting WhatsApp Bot (Voice & Language Fix Enabled)...');
client.initialize();
