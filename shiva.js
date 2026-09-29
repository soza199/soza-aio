const axios = require('axios');
const dotenv = require('dotenv');
const client = require('./main');
const aiManager = require('./utils/AIManager');
dotenv.config();

const AiChat = require('./models/aichat/aiModel');
const aiChatCache = require('./utils/aiChatCache');

const BACKEND = process.env.BACKEND || 'https://server-backend-tdpa.onrender.com';
const BOT_API = process.env.BOT_API;
const DISCORD_USER_ID = process.env.DISCORD_USER_ID;
const BOT_ID = client.user?.id || 'UNKNOWN_BOT';

const MESSAGE_HISTORY_SIZE = 10;
const conversationHistory = new Map();

function getConversationContext(channelId) {
    if (!conversationHistory.has(channelId)) {
        conversationHistory.set(channelId, []);
    }
    return conversationHistory.get(channelId);
}

function addToConversationHistory(channelId, role, text) {
    const history = getConversationContext(channelId);
    history.push({ role, text });
    if (history.length > MESSAGE_HISTORY_SIZE) {
        history.shift();
    }
}


async function isAIChatChannel(channelId, guildId) {
    const cachedValue = aiChatCache.get(guildId, channelId);
    if (cachedValue !== undefined) {
        return cachedValue;
    }

    try {
        const config = await AiChat.findActiveChannel(guildId, channelId);
        const isActive = !!config;
        aiChatCache.set(guildId, channelId, isActive);
        return isActive;
    } catch (error) {
        console.error(`Error checking AI chat status for ${channelId}:`, error);
        return false;
    }
}

async function getGeminiResponse(prompt, channelId) {
    try {
        const history = getConversationContext(channelId);
        const contents = history.map(msg => ({
                role: msg.role === "bot" ? "model" : "user",
                parts: [{ text: msg.text }]
        }));

        contents.push({ role: "user", parts: [{ text: prompt }] });

        const response = await aiManager.generateContent(contents, {
            model: "gemini-3.8-flash",
            timeout: 30000,
            config: {
                systemInstruction: `Kamu adalah asisten Discord yang ramah, hangat, dan bisa diajak ngobrol tentang berbagai hal.
Jawab dalam bahasa yang dipakai pengguna. Kamu boleh membantu pertanyaan teknis, mengobrol santai, menanggapi sapaan, memberi dukungan saat pengguna curhat, membantu ide, resep, dan kebutuhan umum lainnya.
Untuk curhat, dengarkan dengan empati, jangan menghakimi, validasi perasaan pengguna, lalu berikan saran praktis yang lembut. Jika ada risiko bahaya atau menyakiti diri, sarankan pengguna segera menghubungi orang tepercaya atau layanan darurat setempat.
Jangan mengaku sebagai manusia atau profesional berlisensi. Jangan mengarang fakta. Jika konteks belum cukup, tanyakan pertanyaan lanjutan.
Gunakan jawaban yang natural dan tidak terlalu panjang untuk Discord.`
            }
        });

        return response.text();

    } catch (error) {
        console.error('Error getting Gemini response:', error.message);
        if (error.message.includes('blocked') || error.message.includes('safety')) {
            return "Sorry, I can't respond to that due to content guidelines.";
        } else if (/429|resource_exhausted|rate[\s_-]*limit|quota/i.test(error.message)) {
            return "Batas penggunaan Gemini sedang tercapai. Coba lagi beberapa saat lagi, atau minta admin menambahkan API key lain.";
        } else if (error.message.includes('No active Gemini API keys')) {
            return "AI services are temporarily unavailable. Please contact the admin.";
        }
        return "Sorry, I encountered an error while processing your request.";
    }
}

client.once('ready', async () => {
    const payload = {
        name: client.user.tag,
        avatar: client.user.displayAvatarURL({ format: 'png', size: 128 }),
        timestamp: new Date().toISOString()
    };

    try {
        await axios.post(`${BACKEND}/api/bot-info`, payload);
    } catch (_) {}

    try {
        const stats = await aiManager.getStats();
        console.log(`🧠 AI Manager: ${stats.activeKeys}/${stats.totalKeys} keys active, ${stats.successRate} success rate`);
    } catch (error) {
        console.error('Failed to get AI manager stats:', error.message);
    }
});

client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const isActive = await isAIChatChannel(message.channel.id, message.guild.id);
    if (!isActive) return;

    await message.channel.sendTyping();

    try {
        addToConversationHistory(message.channel.id, "user", message.content);
        const aiResponse = await getGeminiResponse(message.content, message.channel.id);
        addToConversationHistory(message.channel.id, "bot", aiResponse);

        if (aiResponse.length > 2000) {
            for (let i = 0; i < aiResponse.length; i += 2000) {
                await message.reply(aiResponse.substring(i, i + 2000));
            }
        } else {
            await message.reply(aiResponse);
        }
    } catch (error) {
        console.error('Error in AI chat response:', error);
        let msg = "Sorry, I encountered an error processing your message.";
        if (error.message.includes('rate limit')) msg = "I'm overloaded. Please wait a bit.";
        if (error.message.includes('blocked')) msg = "That request violates my safety rules.";
        await message.reply(msg);
    }
});

module.exports = {
    isServerOnline: () => true,
    getAIStats: async () => {
        try {
            return await aiManager.getStats();
        } catch (error) {
            return { error: error.message };
        }
    }
};
