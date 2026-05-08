const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const Groq = require('groq-sdk');
require('dotenv').config();

// Initialize Groq AI (fast, free, powered by Llama)
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Initialize WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
});

// Display QR Code in Terminal AND save as image
client.on('qr', async (qr) => {
    console.log('\n--- SCAN THIS QR CODE WITH YOUR WHATSAPP ---');
    qrcode.generate(qr, { small: true });
    console.log('--------------------------------------------\n');

    // Save QR code as a PNG image file
    const qrImagePath = path.join(__dirname, 'SCAN_THIS_QR_CODE.png');
    await QRCode.toFile(qrImagePath, qr, {
        color: { dark: '#000000', light: '#FFFFFF' },
        width: 400,
        margin: 2
    });
    console.log(`✅ QR Code image saved! Open this file and scan it:`);
    console.log(`   ${qrImagePath}\n`);

    // Open the image automatically
    const { exec } = require('child_process');
    exec(`start "" "${qrImagePath}"`);
});

// Bot Ready Status
client.on('ready', () => {
    // Delete QR image once connected
    const qrImagePath = path.join(__dirname, 'SCAN_THIS_QR_CODE.png');
    if (fs.existsSync(qrImagePath)) fs.unlinkSync(qrImagePath);
    console.log('\n✅ WhatsApp Bot is Ready! (Powered by Groq AI)');
    console.log('Listening for incoming messages...\n');
});

// Handle Incoming Messages
client.on('message_create', async (msg) => {
    const from = msg.from;

    // Strict filter: only real individual chats
    // Allow @c.us (old format) and @lid (new WhatsApp format)
    // Block: groups, newsletters, broadcasts, own messages
    const isRealPerson = (from.endsWith('@c.us') || from.endsWith('@lid')) &&
                         !from.includes('@newsletter') &&
                         from !== 'status@broadcast';

    if (!isRealPerson || msg.fromMe || msg.body.trim() === '') return;

    console.log(`📩 Incoming from ${from}: "${msg.body}"`);

    try {
        // Human-like typing delay
        const typingDelay = Math.min(msg.body.length * 40, 3000);
        await new Promise(res => setTimeout(res, typingDelay));

        // Generate response from Groq (Llama model)
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: 'system',
                    content: 'You are an AI automation responding as the user on WhatsApp. Be natural, concise, and human-like. Do not use robotic phrases. Reply in the same language the person messaged in. Keep replies short like a real WhatsApp chat.'
                },
                {
                    role: 'user',
                    content: msg.body
                }
            ],
            model: 'llama-3.3-70b-versatile',
            temperature: 0.8,
            max_tokens: 200
        });

        const responseText = completion.choices[0]?.message?.content || "Hey! I'll get back to you soon.";

        // Send the reply
        await msg.reply(responseText);
        console.log(`✅ Replied: "${responseText.substring(0, 80)}"`);

    } catch (error) {
        console.error('❌ Error:', error.message);
    }
});

// Start the client
console.log('Starting WhatsApp Bot (Groq AI)...');
client.initialize();
