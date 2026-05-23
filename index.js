const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');
const googleTTS = require('google-tts-api');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
require('dotenv').config();

// Try to use static ffmpeg if available (for local Windows), otherwise use system path (for Railway/Linux)
try {
    const ffmpegPath = require('ffmpeg-static');
    const ffprobePath = require('ffprobe-static').path;
    
    if (ffmpegPath && ffprobePath) {
        process.env.FFMPEG_PATH = ffmpegPath; // Set globally
        ffmpeg.setFfmpegPath(ffmpegPath);
        ffmpeg.setFfprobePath(ffprobePath);
        console.log(`✅ FFmpeg Path: ${ffmpegPath}`);
        console.log(`✅ FFprobe Path: ${ffprobePath}`);
    } else {
        throw new Error('Static binaries not properly loaded');
    }
} catch (e) {
    console.log('📡 Using system FFmpeg/FFprobe (Static binaries not found or failed).');
}

// Initialize Groq AI
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Health Check & QR Server for Railway
const http = require('http');
const port = process.env.PORT || 3000;
http.createServer((req, res) => {
    if (req.url === '/qr') {
        const qrPath = path.join(__dirname, 'SCAN_THIS_QR_CODE.png');
        if (fs.existsSync(qrPath)) {
            res.writeHead(200, { 'Content-Type': 'image/png' });
            return res.end(fs.readFileSync(qrPath));
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            return res.end('QR not ready. Refresh in 5s.');
        }
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot Active. Go to /qr');
}).listen(port, '0.0.0.0');

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
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// QR Code handling
client.on('qr', async (qr) => {
    console.log('\n--- SCAN THIS QR CODE ---');
    qrcode.generate(qr, { small: true });
    
    const qrImagePath = path.join(__dirname, 'SCAN_THIS_QR_CODE.png');
    try {
        await QRCode.toFile(qrImagePath, qr, {
            color: { dark: '#000000', light: '#FFFFFF' },
            width: 500,
            margin: 2
        });
        console.log(`✅ QR Code image updated at: ${qrImagePath}`);
    } catch (err) {
        console.error('❌ Failed to save QR image:', err);
    }
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
        const history = await chat.fetchMessages({ limit: 40 });
        const conversationHistory = history
            .filter(m => m.body && m.body.trim() !== '')
            .map(m => ({
                role: m.fromMe ? 'assistant' : 'user',
                content: m.body
            }));

        // CHECK FOR RESEND / FORWARD REQUESTS
        const userMessageLower = userMessage.toLowerCase();
        const isRequestToResend = /dobara|phir se|resend|send again|wapis bhej|wapas bhej|dubara|forward|screenshot|ss |screen shot/i.test(userMessageLower);
        if (isRequestToResend) {
            console.log(`🔄 User requested to resend/forward previous data...`);
            // Find the most recent media message or long message in the history (excluding the current message)
            const targetMsg = history
                .slice()
                .reverse()
                .find(m => m.id.id !== msg.id.id && (m.hasMedia || (m.body && m.body.length > 50)));

            if (targetMsg) {
                console.log(`📦 Found message to forward: ${targetMsg.id.id}`);
                try {
                    // Send a natural human-like confirmation reply first
                    const isUrduScript = /[\u0600-\u06FF]/.test(userMessage);
                    const replyText = isUrduScript ? "جی ابھی بھیجتا ہوں" : "Ji abhi send karta hun";
                    await msg.reply(replyText);
                    console.log(`✅ Sent text confirmation reply.`);

                    // Wait a second to feel natural, then forward the actual message
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    await targetMsg.forward(from);
                    console.log(`✅ Successfully forwarded previous message.`);
                    return; // Done
                } catch (err) {
                    console.error(`❌ Failed to forward message:`, err.message);
                }
            }
        }

        await new Promise(res => setTimeout(res, 2000));

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: `Your name is ASIF. You are a real person from Pakistan chatting on WhatsApp.
STRICT RULES:
1. Always talk as ASIF. 
2. Match the user's language and tone/vibe EXACTLY (Roman Urdu -> Roman Urdu, Urdu Script -> Urdu Script, English -> English).
3. If the user uses swearing/slang (gali), respond in the exact same casual/aggressive tone (gali ka jawab usi tarah aggressive ya slang me do). Match their energy perfectly.
4. Keep replies extremely casual, natural, and short (1-2 sentences max, like a real WhatsApp text). Never use formal grammar.
5. Do NOT put trailing dots (full stops) or question marks at the very end of your messages.
6. NEVER reveal you are an AI. You are a human named Asif.`
                },
                ...conversationHistory
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.8,
        });

        let responseText = completion.choices[0]?.message?.content || "Theek hai!";
        
        // Remove all dots/full-stops completely (both end and middle) to keep it extremely casual
        responseText = responseText.replace(/\./g, '');
        
        // Remove all question marks and exclamation marks completely
        responseText = responseText.replace(/[\?\!]+/g, '');
        
        responseText = responseText.trim();

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
                    try {
                        const ffmpegPath = require('ffmpeg-static');
                        const ffprobePath = require('ffprobe-static').path;
                        if (ffmpegPath) command.setFfmpegPath(ffmpegPath);
                        if (ffprobePath) command.setFfprobePath(ffprobePath);
                    } catch (e) {
                        // Using system FFmpeg/FFprobe fallback
                    }

                    tempMp3s.forEach(file => { command = command.input(file); });
                    command.on('end', resolve).on('error', (err) => {
                        console.error('❌ FFmpeg Merge Error:', err.message);
                        reject(err);
                    }).mergeToFile(tempOgg, __dirname);
                });

                await new Promise((resolve, reject) => {
                    let command = ffmpeg(tempOgg);
                    try {
                        const ffmpegPath = require('ffmpeg-static');
                        const ffprobePath = require('ffprobe-static').path;
                        if (ffmpegPath) command.setFfmpegPath(ffmpegPath);
                        if (ffprobePath) command.setFfprobePath(ffprobePath);
                    } catch (e) {
                        // Using system FFmpeg/FFprobe fallback
                    }
                    command
                        .toFormat('ogg')
                        .audioCodec('libopus')
                        .on('end', resolve)
                        .on('error', (err) => {
                            console.error('❌ FFmpeg Convert Error:', err.message);
                            reject(err);
                        })
                        .save(finalOgg);
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
            console.log(`✅ Sent text reply: "${responseText}"`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
});

console.log('Starting WhatsApp Bot (Voice & Language Fix Enabled)...');
client.initialize();
