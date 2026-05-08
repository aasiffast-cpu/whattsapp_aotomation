const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash",
    systemInstruction: "You are an AI automation responding as the user on WhatsApp. Your goal is to be helpful and natural. Keep replies concise and human-like. Do not use overly formal language unless the sender is formal. Avoid saying 'As an AI...' or 'How can I help you today?' in a robotic way. Just chat naturally."
});

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
    console.log('\n✅ WhatsApp Bot is Ready!');
    console.log('Listening for incoming messages...\n');
});

// Handle Incoming Messages
client.on('message', async (msg) => {
    // Only reply to individual chats (exclude groups and your own messages)
    if (msg.from.endsWith('@c.us') && !msg.fromMe) {
        console.log(`Incoming message from ${msg.from}: "${msg.body}"`);

        try {
            const chat = await msg.getChat();
            
            // Show "typing..." status to feel more human
            await chat.sendStateTyping();

            // Small delay to simulate typing time
            const typingDelay = Math.min(msg.body.length * 50, 3000); 
            await new Promise(res => setTimeout(res, typingDelay));

            // Generate response from Gemini
            const result = await model.generateContent(msg.body);
            const responseText = result.response.text();

            // Send the reply
            await msg.reply(responseText);
            console.log(`Replied with: "${responseText.substring(0, 50)}..."`);

            // Stop typing status
            await chat.clearState();
        } catch (error) {
            console.error('❌ Error generating or sending response:', error);
        }
    }
});

// Start the client
console.log('Starting WhatsApp client...');
client.initialize();
