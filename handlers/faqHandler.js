// handlers/faqHandler.js
const FaqConfig = require('../models/faq/faqModel');
const axios = require('axios');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent';

// 🔒 RATE LIMITING SYSTEM WITH MAPS
const userCooldowns = new Map(); // userId -> { lastUsed, blockedUntil, requestCount, violations }
const userInfo = new Map(); // userId -> { username, tag, joinedAt, avatarURL, firstSeen }

// 🚨 ENHANCED RATE LIMITING CONFIGURATION WITH DISCORD TIMEOUTS
const RATE_LIMIT_CONFIG = {
    cooldownTime: 10000,    // 10 seconds between requests (strict!)
    
    // Low violation levels (1-2 violations) - Virtual cooldowns only
    lowViolationTimeout: 30000, // 30 seconds virtual timeout
    
    // High violation levels (3+ violations) - Real Discord timeouts
    discordTimeoutDuration: 300000, // 5 minutes Discord timeout
    extremeTimeoutDuration: 600000, // 10 minutes for extreme cases
    
    maxViolationsBeforeDiscordTimeout: 3, // Discord timeout threshold
    maxViolationsBeforeExtreme: 5, // Extreme timeout threshold
    
    cleanupInterval: 600000, // Clean old entries every 10 minutes
    
    // Timeout reasons for Discord
    timeoutReasons: {
        moderate: "FAQ spam protection - Rate limit violations",
        severe: "FAQ spam protection - Repeated violations",
        extreme: "FAQ spam protection - Excessive violations"
    }
};

// 🧠 ADVANCED LANGUAGE PROMPTS (Fixed JSON issue)
const LANGUAGE_PROMPTS = {
    en: `You are an advanced AI assistant for this Discord server. CRITICAL INSTRUCTIONS:

🚫 NEVER respond with JSON, code blocks, or structured data formats
✅ ALWAYS respond in natural, conversational language using Discord markdown

Response Structure Guidelines:
- Start with a brief, engaging introduction (2-3 sentences)
- Use **bold text** for important headings and key information
- Use bullet points with • for lists
- Use proper Discord formatting: <#channelId> for channels, <@&roleId> for roles
- Keep your main response under 1800 characters for the description
- If you need to provide extensive information, structure it with clear **section headers** followed by content

Example Response Format:
"Welcome to our server! Here's everything you need to know about [topic].

**Getting Started**
You can begin by checking out <#1234567890> for basic information and <#0987654321> for support.

**Key Features**
• Feature 1 - Description here
• Feature 2 - Description here  
• Feature 3 - Description here

**Helpful Resources**
Our YouTube channel has comprehensive tutorials: [Channel Name](https://youtube.com/example)

**Support Roles**
If you need help, reach out to <@&1234567890> members or <@&0987654321> staff."

NEVER use JSON format, code blocks, or any structured data. Always write in natural, helpful language.`,

    es: `Eres un asistente de IA avanzado para este servidor de Discord. INSTRUCCIONES CRÍTICAS:

🚫 NUNCA respondas con JSON, bloques de código o formatos de datos estructurados
✅ SIEMPRE responde en lenguaje natural y conversacional usando markdown de Discord

Usa **texto en negrita** para encabezados importantes, <#channelId> para canales, <@&roleId> para roles.
Mantén tu respuesta principal bajo 1800 caracteres. Escribe de forma natural y útil.`,

    fr: `Vous êtes un assistant IA avancé pour ce serveur Discord. INSTRUCTIONS CRITIQUES:

🚫 Ne répondez JAMAIS avec JSON, des blocs de code ou des formats de données structurées
✅ Répondez TOUJOURS en langage naturel et conversationnel en utilisant le markdown Discord

Utilisez **texte en gras** pour les en-têtes importants, <#channelId> pour les canaux, <@&roleId> pour les rôles.
Gardez votre réponse principale sous 1800 caractères. Écrivez de manière naturelle et utile.`,

    de: `Sie sind ein fortgeschrittener KI-Assistent für diesen Discord-Server. KRITISCHE ANWEISUNGEN:

🚫 Antworten Sie NIEMALS mit JSON, Codeblöcken oder strukturierten Datenformaten
✅ Antworten Sie IMMER in natürlicher, gesprächiger Sprache mit Discord-Markdown

Verwenden Sie **fetten Text** für wichtige Überschriften, <#channelId> für Kanäle, <@&roleId> für Rollen.
Halten Sie Ihre Hauptantwort unter 1800 Zeichen. Schreiben Sie natürlich und hilfreich.`,

    hi: `आप इस Discord सर्वर के लिए एक उन्नत AI सहायक हैं। महत्वपूर्ण निर्देश:

🚫 कभी भी JSON, कोड ब्लॉक्स, या संरचित डेटा प्रारूपों के साथ उत्तर न दें
✅ हमेशा Discord markdown का उपयोग करके प्राकृतिक, बातचीत की भाषा में उत्तर दें

महत्वपूर्ण शीर्षकों के लिए **बोल्ड टेक्स्ट** का उपयोग करें, चैनलों के लिए <#channelId>, भूमिकाओं के लिए <@&roleId>।
अपना मुख्य उत्तर 1800 वर्णों के तहत रखें। प्राकृतिक और उपयोगी तरीके से लिखें।`,

    ja: `あなたはこのDiscordサーバーの高度なAIアシスタントです。重要な指示：

🚫 JSON、コードブロック、または構造化データ形式で応答しないでください
✅ 常にDiscordマークダウンを使用して自然で会話的な言語で応答してください

重要な見出しには**太字テキスト**を使用し、チャンネルには<#channelId>、ロールには<@&roleId>を使用してください。
メインレスポンスは1800文字以下に保ってください。自然で有用に書いてください。`,

    ko: `당신은 이 Discord 서버의 고급 AI 어시스턴트입니다. 중요한 지침:

🚫 JSON, 코드 블록 또는 구조화된 데이터 형식으로 응답하지 마세요
✅ 항상 Discord 마크다운을 사용하여 자연스럽고 대화적인 언어로 응답하세요

중요한 헤딩에는 **굵은 텍스트**를 사용하고, 채널에는 <#channelId>, 역할에는 <@&roleId>를 사용하세요.
주요 응답을 1800자 이하로 유지하세요. 자연스럽고 유용하게 작성하세요.`,

    zh: `您是这个Discord服务器的高级AI助手。关键指示：

🚫 绝不要用JSON、代码块或结构化数据格式回应
✅ 始终使用Discord markdown以自然、对话式的语言回应

对重要标题使用**粗体文本**，频道使用<#channelId>，角色使用<@&roleId>。
将主要回应保持在1800字符以下。以自然和有用的方式书写。`,

    ar: `أنت مساعد ذكي متقدم لخادم Discord هذا. تعليمات مهمة:

🚫 لا تجب أبداً بـ JSON أو كتل الكود أو تنسيقات البيانات المنظمة
✅ أجب دائماً بلغة طبيعية ومحادثة باستخدام markdown Discord

استخدم **النص العريض** للعناوين المهمة، <#channelId> للقنوات، <@&roleId> للأدوار.
اجعل ردك الرئيسي أقل من 1800 حرف. اكتب بطريقة طبيعية ومفيدة.`,

    pt: `Você é um assistente de IA avançado para este servidor Discord. INSTRUÇÕES CRÍTICAS:

🚫 NUNCA responda com JSON, blocos de código ou formatos de dados estruturados
✅ SEMPRE responda em linguagem natural e conversacional usando markdown Discord

Use **texto em negrito** para cabeçalhos importantes, <#channelId> para canais, <@&roleId> para funções.
Mantenha sua resposta principal abaixo de 1800 caracteres. Escreva de forma natural e útil.`,

    ru: `Вы продвинутый ИИ-помощник для этого Discord сервера. КРИТИЧЕСКИЕ ИНСТРУКЦИИ:

🚫 НИКОГДА не отвечайте JSON, блоками кода или структурированными форматами данных
✅ ВСЕГДА отвечайте естественным разговорным языком, используя Discord markdown

Используйте **жирный текст** для важных заголовков, <#channelId> для каналов, <@&roleId> для ролей.
Держите основной ответ менее 1800 символов. Пишите естественно и полезно.`
};

// Enhanced embed color schemes
const EMBED_COLORS = {
    info: 0x3498db,      // Blue
    success: 0x2ecc71,   // Green  
    warning: 0xf39c12,   // Orange
    error: 0xe74c3c,     // Red
    features: 0x9b59b6,  // Purple
    links: 0x1abc9c,     // Teal
    server: 0x34495e,    // Dark blue-gray
    welcome: 0x00ff7f,   // Spring green
    tutorial: 0xff69b4,  // Hot pink
    rateLimit: 0xff6b6b, // Red for rate limiting
    timeout: 0x8e44ad,   // Purple for timeouts
    discordTimeout: 0xdc143c, // Crimson for Discord timeouts
    extreme: 0x800000,   // Dark red for extreme timeouts
    default: 0x5865f2    // Discord blurple
};

// 🛡️ ENHANCED RATE LIMITING FUNCTIONS WITH DISCORD TIMEOUTS
function updateUserInfo(user) {
    const userId = user.id;
    const currentInfo = userInfo.get(userId);
    
    const newInfo = {
        username: user.username,
        tag: user.tag,
        displayName: user.displayName || user.username,
        avatarURL: user.displayAvatarURL({ dynamic: true, size: 256 }),
        joinedAt: user.joinedTimestamp ? new Date(user.joinedTimestamp) : null,
        firstSeen: currentInfo?.firstSeen || new Date(),
        lastSeen: new Date(),
        totalRequests: (currentInfo?.totalRequests || 0) + 1
    };
    
    userInfo.set(userId, newInfo);
    return newInfo;
}

async function checkRateLimit(userId, member, guild) {
    const now = Date.now();
    const userData = userCooldowns.get(userId);
    
    if (!userData) {
        userCooldowns.set(userId, {
            lastUsed: now,
            blockedUntil: 0,
            requestCount: 1,
            violations: 0,
            firstRequest: now,
            discordTimeoutApplied: false
        });
        return { allowed: true, timeLeft: 0 };
    }
    
    // Check if user is currently timed out (virtual or Discord)
    if (userData.blockedUntil > now) {
        const timeLeft = Math.ceil((userData.blockedUntil - now) / 1000);
        return { 
            allowed: false, 
            timeLeft, 
            reason: userData.discordTimeoutApplied ? 'DISCORD_TIMEOUT' : 'VIRTUAL_TIMEOUT',
            violations: userData.violations
        };
    }
    
    // Check cooldown period
    const timeSinceLastRequest = now - userData.lastUsed;
    if (timeSinceLastRequest < RATE_LIMIT_CONFIG.cooldownTime) {
        const violations = userData.violations + 1;
        
        // Determine punishment type based on violation count
        let timeoutDuration;
        let applyDiscordTimeout = false;
        let timeoutReason = '';
        
        if (violations >= RATE_LIMIT_CONFIG.maxViolationsBeforeExtreme) {
            // Extreme violations - Longer Discord timeout
            timeoutDuration = RATE_LIMIT_CONFIG.extremeTimeoutDuration;
            applyDiscordTimeout = true;
            timeoutReason = 'EXTREME';
        } else if (violations >= RATE_LIMIT_CONFIG.maxViolationsBeforeDiscordTimeout) {
            // High violations - Discord timeout
            timeoutDuration = RATE_LIMIT_CONFIG.discordTimeoutDuration;
            applyDiscordTimeout = true;
            timeoutReason = 'SEVERE';
        } else {
            // Low violations - Virtual timeout only
            timeoutDuration = RATE_LIMIT_CONFIG.lowViolationTimeout;
            applyDiscordTimeout = false;
            timeoutReason = 'MODERATE';
        }
        
        // Apply Discord timeout if needed
        let discordTimeoutSuccess = false;
        if (applyDiscordTimeout && member && guild) {
            discordTimeoutSuccess = await applyDiscordTimeout(member, timeoutDuration, timeoutReason, guild);
        }
        
        // Update user data
        userCooldowns.set(userId, {
            ...userData,
            violations,
            blockedUntil: now + timeoutDuration,
            requestCount: userData.requestCount + 1,
            discordTimeoutApplied: discordTimeoutSuccess
        });
        
        const timeLeft = Math.ceil(timeoutDuration / 1000);
        return { 
            allowed: false, 
            timeLeft, 
            reason: discordTimeoutSuccess ? 'DISCORD_TIMEOUT' : (applyDiscordTimeout ? 'DISCORD_TIMEOUT_FAILED' : 'VIRTUAL_TIMEOUT'),
            violations,
            timeoutType: timeoutReason
        };
    }
    
    // Request allowed - update last used
    userCooldowns.set(userId, {
        ...userData,
        lastUsed: now,
        requestCount: userData.requestCount + 1,
        blockedUntil: 0,
        discordTimeoutApplied: false
    });
    
    return { allowed: true, timeLeft: 0 };
}

// 🚨 DISCORD TIMEOUT APPLICATION FUNCTION
async function applyDiscordTimeout(member, duration, severity, guild) {
    try {
        // Check if bot has permission to timeout members
        const botMember = guild.members.me;
        if (!botMember.permissions.has(PermissionFlagsBits.ModerateMembers)) {
            console.log(`[FAQ TIMEOUT] Missing permissions to timeout members in ${guild.name}`);
            return false;
        }
        
        // Check if member can be timed out (hierarchy check)
        if (member.roles.highest.position >= botMember.roles.highest.position) {
            console.log(`[FAQ TIMEOUT] Cannot timeout ${member.user.tag} - Higher role hierarchy`);
            return false;
        }
        
        // Check if member is already timed out
        if (member.isCommunicationDisabled()) {
            console.log(`[FAQ TIMEOUT] ${member.user.tag} is already timed out`);
            return true; // Consider it successful since they're already timed out
        }
        
        // Apply the timeout
        const timeoutReason = RATE_LIMIT_CONFIG.timeoutReasons[severity.toLowerCase()] || 
                            RATE_LIMIT_CONFIG.timeoutReasons.moderate;
        
        await member.timeout(duration, timeoutReason);
        
        console.log(`[FAQ TIMEOUT] Successfully timed out ${member.user.tag} for ${Math.ceil(duration / 1000)}s. Reason: ${severity}`);
        return true;
        
    } catch (error) {
        console.error(`[FAQ TIMEOUT] Failed to timeout ${member.user.tag}:`, error);
        return false;
    }
}

function getRemainingCooldown(userId) {
    const userData = userCooldowns.get(userId);
    if (!userData) return 0;
    
    const now = Date.now();
    const timeSinceLastRequest = now - userData.lastUsed;
    const remainingCooldown = RATE_LIMIT_CONFIG.cooldownTime - timeSinceLastRequest;
    
    return Math.max(0, Math.ceil(remainingCooldown / 1000));
}

// 🚨 ENHANCED RATE LIMIT EMBED WITH DISCORD TIMEOUT INFO
function createRateLimitEmbed(user, rateLimitInfo) {
    const userInfoData = userInfo.get(user.id);
    const embed = new EmbedBuilder();
    
    // Determine embed styling based on timeout type
    if (rateLimitInfo.reason === 'DISCORD_TIMEOUT') {
        if (rateLimitInfo.timeoutType === 'EXTREME') {
            embed
                .setColor(EMBED_COLORS.extreme)
                .setTitle('🔒 EXTREME TIMEOUT APPLIED')
                .setDescription(`**${user.displayName}**, you have been **timed out on Discord** due to excessive FAQ spam violations!`)
                .addFields(
                    { name: '⏰ Discord Timeout Duration', value: `${rateLimitInfo.timeLeft} seconds`, inline: true },
                    { name: '🚨 Violation Level', value: `EXTREME (${rateLimitInfo.violations} violations)`, inline: true },
                    { name: '📋 Punishment', value: 'Real Discord timeout applied', inline: false },
                    { name: '⚠️ Warning', value: 'You cannot send messages, react, or speak in voice channels during this timeout.', inline: false }
                );
        } else {
            embed
                .setColor(EMBED_COLORS.discordTimeout)
                .setTitle('🚫 DISCORD TIMEOUT APPLIED')
                .setDescription(`**${user.displayName}**, you have been **timed out on Discord** for repeated FAQ spam violations!`)
                .addFields(
                    { name: '⏰ Discord Timeout Duration', value: `${rateLimitInfo.timeLeft} seconds`, inline: true },
                    { name: '⚠️ Violation Level', value: `HIGH (${rateLimitInfo.violations} violations)`, inline: true },
                    { name: '📋 Punishment', value: 'Real Discord timeout applied', inline: false },
                    { name: '💡 Note', value: 'This timeout affects your entire server experience, not just the FAQ system.', inline: false }
                );
        }
    } else if (rateLimitInfo.reason === 'DISCORD_TIMEOUT_FAILED') {
        embed
            .setColor(EMBED_COLORS.error)
            .setTitle('⚠️ TIMEOUT ATTEMPT FAILED')
            .setDescription(`**${user.displayName}**, a Discord timeout was attempted but failed. Virtual timeout applied instead.`)
            .addFields(
                { name: '⏱️ Virtual Timeout', value: `${rateLimitInfo.timeLeft} seconds`, inline: true },
                { name: '⚠️ Violation Level', value: `HIGH (${rateLimitInfo.violations} violations)`, inline: true },
                { name: '📋 Issue', value: 'Discord timeout failed - possibly due to permissions or role hierarchy', inline: false }
            );
    } else {
        // Virtual timeout for low violations
        embed
            .setColor(EMBED_COLORS.rateLimit)
            .setTitle('⚡ RATE LIMIT COOLDOWN')
            .setDescription(`**${user.displayName}**, slow down! You're making FAQ requests too quickly.`)
            .addFields(
                { name: '⏱️ Cooldown Period', value: `${rateLimitInfo.timeLeft} seconds`, inline: true },
                { name: '🔄 Next Request', value: `<t:${Math.floor((Date.now() + rateLimitInfo.timeLeft * 1000) / 1000)}:R>`, inline: true },
                { name: '⚙️ Rate Limit', value: `1 request per ${RATE_LIMIT_CONFIG.cooldownTime / 1000} seconds`, inline: false },
                { name: '⚠️ Warning', value: `${RATE_LIMIT_CONFIG.maxViolationsBeforeDiscordTimeout - rateLimitInfo.violations} more violation(s) will result in a Discord timeout!`, inline: false }
            );
    }
    
    // Add user statistics
    if (userInfoData) {
        embed.addFields(
            { name: '📊 Your Stats', value: `Total FAQ Requests: ${userInfoData.totalRequests}\nFirst Seen: <t:${Math.floor(userInfoData.firstSeen.getTime() / 1000)}:R>`, inline: false }
        );
    }
    
    embed
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setFooter({ text: 'FAQ Rate Limiting & Discord Timeout System' })
        .setTimestamp();
    
    return embed;
}

// Cleanup old entries periodically
setInterval(() => {
    const now = Date.now();
    const cutoffTime = now - (24 * 60 * 60 * 1000);
    
    for (const [userId, userData] of userCooldowns.entries()) {
        if (userData.blockedUntil < now && userData.lastUsed < cutoffTime) {
            userCooldowns.delete(userId);
        }
    }
    
    const userInfoCutoff = now - (7 * 24 * 60 * 60 * 1000);
    for (const [userId, userInfoData] of userInfo.entries()) {
        if (userInfoData.lastSeen.getTime() < userInfoCutoff) {
            userInfo.delete(userId);
        }
    }
    
    //console.log(`[FAQ] Cleaned up old rate limit entries. Active users: ${userCooldowns.size}, User info: ${userInfo.size}`);
}, RATE_LIMIT_CONFIG.cleanupInterval);

// 🧠 ADVANCED CONTEXT BUILDER
function buildEnhancedContext(config, prompt, guild, user) {
    const language = config.context?.language || 'en';
    const basePrompt = LANGUAGE_PROMPTS[language] || LANGUAGE_PROMPTS.en;
    
    let contextPrompt = basePrompt + "\n\n";
    
    // Add user context
    const userInfoData = userInfo.get(user.id);
    if (userInfoData) {
        contextPrompt += `**USER CONTEXT:**\n`;
        contextPrompt += `• User: ${userInfoData.displayName} (${userInfoData.tag})\n`;
        contextPrompt += `• Total FAQ Requests: ${userInfoData.totalRequests}\n`;
        contextPrompt += `• Member since: ${userInfoData.firstSeen.toLocaleDateString()}\n`;
        if (userInfoData.joinedAt) {
            contextPrompt += `• Joined server: ${userInfoData.joinedAt.toLocaleDateString()}\n`;
        }
        contextPrompt += "\n";
    }
    
    // Add server context
    if (config.context?.serverDescription) {
        contextPrompt += `**SERVER CONTEXT:**\n${config.context.serverDescription}\n\n`;
    }
    
    // Add comprehensive server metadata
    if (config.serverMetadata) {
        contextPrompt += `**SERVER DETAILS:**\n`;
        contextPrompt += `• Server: ${config.serverMetadata.serverName}\n`;
        contextPrompt += `• Members: ${config.serverMetadata.memberCount}\n`;
        contextPrompt += `• Channels: ${config.serverMetadata.channelCount}\n`;
        contextPrompt += `• Roles: ${config.serverMetadata.roleCount}\n\n`;
        
        // Enhanced channel listing with better organization
        if (config.serverMetadata.channels?.length > 0) {
            const channelsByType = {};
            config.serverMetadata.channels.forEach(channel => {
                const type = getChannelTypeForContext(channel.type);
                if (!channelsByType[type]) channelsByType[type] = [];
                channelsByType[type].push(channel);
            });
            
            contextPrompt += `**IMPORTANT CHANNELS:**\n`;
            Object.entries(channelsByType).forEach(([type, channels]) => {
                if (channels.length > 0) {
                    contextPrompt += `${type}: ${channels.slice(0, 8).map(ch => `<#${ch.id}>`).join(', ')}\n`;
                }
            });
            contextPrompt += "\n";
        }
        
        // Enhanced role listing
        if (config.serverMetadata.roles?.length > 0) {
            const importantRoles = config.serverMetadata.roles
                .filter(role => role.name !== '@everyone' && !role.name.toLowerCase().includes('bot'))
                .slice(0, 12);
            
            if (importantRoles.length > 0) {
                contextPrompt += `**KEY ROLES:** ${importantRoles.map(role => `<@&${role.id}>`).join(', ')}\n\n`;
            }
        }
    }
    
    // Enhanced link organization
    if (config.links?.length > 0) {
        contextPrompt += `**AVAILABLE RESOURCES:**\n`;
        const linksByType = {};
        config.links.forEach(link => {
            const type = link.type.charAt(0).toUpperCase() + link.type.slice(1);
            if (!linksByType[type]) linksByType[type] = [];
            linksByType[type].push(link);
        });
        
        Object.entries(linksByType).forEach(([type, links]) => {
            contextPrompt += `${type}: `;
            links.forEach((link, index) => {
                contextPrompt += `[${link.name}](${link.url})`;
                if (index < links.length - 1) contextPrompt += ', ';
            });
            contextPrompt += '\n';
        });
        contextPrompt += "\n";
    }
    
    // Add question context and special instructions
    contextPrompt += `**USER QUESTION:** "${prompt}"\n\n`;
    
    // Add contextual instructions based on question type
    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes('welcome') || lowerPrompt.includes('getting started')) {
        contextPrompt += `**SPECIAL CONTEXT:** This appears to be a welcome/getting started question. Provide a warm, comprehensive welcome with key channels, roles, and resources.\n\n`;
    } else if (lowerPrompt.includes('tutorial') || lowerPrompt.includes('guide') || lowerPrompt.includes('how to')) {
        contextPrompt += `**SPECIAL CONTEXT:** This is a tutorial request. Focus on step-by-step guidance and relevant links.\n\n`;
    } else if (lowerPrompt.includes('channel') || lowerPrompt.includes('where')) {
        contextPrompt += `**SPECIAL CONTEXT:** User is looking for specific channels or locations. Emphasize channel mentions and navigation.\n\n`;
    } else if (lowerPrompt.includes('feature') || lowerPrompt.includes('bot') || lowerPrompt.includes('aio')) {
        contextPrompt += `**SPECIAL CONTEXT:** This is about bot features. Focus on AIO Bot capabilities and relevant setup information.\n\n`;
    }
    
    contextPrompt += `**RESPONSE REQUIREMENTS:**
- Write in natural, conversational language (NO JSON or code blocks!)
- Use Discord markdown formatting appropriately
- Keep your main response under 1800 characters
- Structure information clearly with **bold headers**
- Include relevant channel and role mentions where appropriate
- Be welcoming, helpful, and informative
- End with an offer for further assistance if needed`;
    
    return contextPrompt;
}

function getChannelTypeForContext(type) {
    const typeMap = {
        '0': 'Text',
        '2': 'Voice', 
        '4': 'Category',
        '5': 'Announcement',
        '13': 'Stage',
        '15': 'Forum'
    };
    return typeMap[type] || 'Other';
}

// 🚀 ADVANCED EMBED CREATION WITH INTELLIGENT PARSING
function createAdvancedResponseEmbed(aiResponse, config, guild, prompt, user) {
    const embed = new EmbedBuilder();
    const userInfoData = userInfo.get(user.id);
    
    // Determine embed color based on question type with more intelligence
    let embedColor = EMBED_COLORS.default;
    let embedTitle = "FAQ Response";
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('welcome') || lowerPrompt.includes('getting started')) {
        embedColor = EMBED_COLORS.welcome;
        embedTitle = `Welcome to ${guild.name}!`;
    } else if (lowerPrompt.includes('tutorial') || lowerPrompt.includes('guide') || lowerPrompt.includes('how to')) {
        embedColor = EMBED_COLORS.tutorial;
        embedTitle = "Tutorial & Guide";
    } else if (lowerPrompt.includes('link') || lowerPrompt.includes('resource')) {
        embedColor = EMBED_COLORS.links;
        embedTitle = "Server Resources";
    } else if (lowerPrompt.includes('channel') || lowerPrompt.includes('where')) {
        embedColor = EMBED_COLORS.server;
        embedTitle = "Server Navigation";
    } else if (lowerPrompt.includes('feature') || lowerPrompt.includes('aio') || lowerPrompt.includes('bot')) {
        embedColor = EMBED_COLORS.features;
        embedTitle = "AIO Bot Features";
    } else if (lowerPrompt.includes('help') || lowerPrompt.includes('support')) {
        embedColor = EMBED_COLORS.info;
        embedTitle = "Help & Support";
    }
    
    embed.setColor(embedColor);
    embed.setTitle(embedTitle);
    
    // Set enhanced author with user context
    if (guild) {
        embed.setAuthor({ 
            name: `${guild.name} FAQ Assistant`, 
            iconURL: guild.iconURL({ dynamic: true }) || undefined 
        });
        
        if (guild.iconURL()) {
            embed.setThumbnail(guild.iconURL({ dynamic: true, size: 256 }));
        }
    }
    
    // 🧠 INTELLIGENT RESPONSE PARSING
    const processedResponse = parseAdvancedResponse(aiResponse);
    
    // Handle potential JSON responses (fallback)
    if (isJsonResponse(aiResponse)) {
        console.log("[FAQ] Detected JSON response, converting to natural language");
        const convertedResponse = convertJsonToNatural(aiResponse, guild, user);
        const reprocessed = parseAdvancedResponse(convertedResponse);
        
        embed.setDescription(reprocessed.description || "Unable to process response properly.");
        if (reprocessed.fields.length > 0) {
            reprocessed.fields.slice(0, 25).forEach(field => {
                embed.addFields(field);
            });
        }
    } else {
        // Normal natural language response
        embed.setDescription(processedResponse.description || "No response generated.");
        
        if (processedResponse.fields && processedResponse.fields.length > 0) {
            processedResponse.fields.slice(0, 25).forEach(field => {
                embed.addFields({
                    name: field.name.substring(0, 256),
                    value: field.value.substring(0, 1024),
                    inline: field.inline || false
                });
            });
        }
    }
    
    // Add contextual fields based on question type
    addContextualFields(embed, config, lowerPrompt, guild);
    
    // Enhanced footer with comprehensive info
    const nextRequestTime = Math.floor((Date.now() + RATE_LIMIT_CONFIG.cooldownTime) / 1000);
    let footerText = `Query #${config.usage?.totalQueries || 0}`;
    
    if (userInfoData) {
        footerText += ` • ${user.displayName}'s request #${userInfoData.totalRequests}`;
    }
    
    embed.setFooter({ 
        text: footerText + ` • Next request <t:${nextRequestTime}:R>`,
        iconURL: user.displayAvatarURL({ dynamic: true, size: 64 }) || undefined
    });
    
    embed.setTimestamp();
    
    return embed;
}

// 🔍 INTELLIGENT RESPONSE PARSER
function parseAdvancedResponse(response) {
    const result = {
        description: '',
        fields: []
    };
    
    // Clean up the response
    let cleanResponse = response
        .replace(/``````/g, '') // Remove any JSON code blocks
        .replace(/``````/g, '') // Remove any other code blocks
        .trim();
    
    // Split response into logical sections
    const sections = cleanResponse.split(/\n\s*\n/);
    let mainContent = '';
    let currentField = null;
    
    for (let section of sections) {
        section = section.trim();
        if (!section) continue;
        
        // Look for bold headers that could be fields
        const boldHeaderMatch = section.match(/^\*\*([^*]+)\*\*\s*\n?([\s\S]*)/);
        if (boldHeaderMatch && boldHeaderMatch[1].length < 100 && boldHeaderMatch[2].trim()) {
            // This looks like a field
            if (currentField && currentField.value.trim()) {
                result.fields.push(currentField);
            }
            
            currentField = {
                name: boldHeaderMatch[1],
                value: boldHeaderMatch[2].trim(),
                inline: false
            };
        } else if (section.match(/^[•\-\*]\s/)) {
            // This is a list item, add to current field or main content
            if (currentField) {
                currentField.value += '\n' + section;
            } else {
                mainContent += section + '\n';
            }
        } else if (section.length > 0) {
            // Regular content
            if (!currentField && mainContent.length < 1500) {
                mainContent += section + '\n\n';
            } else if (currentField) {
                currentField.value += '\n' + section;
            } else {
                // If main content is getting too long, start a new field
                if (currentField) result.fields.push(currentField);
                currentField = {
                    name: 'Additional Information',
                    value: section,
                    inline: false
                };
            }
        }
    }
    
    // Add the last field if it exists
    if (currentField && currentField.value.trim()) {
        result.fields.push(currentField);
    }
    
    result.description = mainContent.trim();
    
    // If description is too long, move some content to fields
    if (result.description.length > 2048) {
        const overflow = result.description.substring(2048);
        result.description = result.description.substring(0, 2045) + '...';
        
        if (result.fields.length < 25) {
            result.fields.unshift({
                name: 'Additional Information',
                value: overflow.substring(0, 1024),
                inline: false
            });
        }
    }
    
    return result;
}

// 🔧 JSON DETECTION AND CONVERSION
function isJsonResponse(response) {
    try {
        const trimmed = response.trim();
        return (trimmed.startsWith('{') && trimmed.endsWith('}')) || 
               (trimmed.startsWith('[') && trimmed.endsWith(']'));
    } catch {
        return false;
    }
}

function convertJsonToNatural(jsonResponse, guild, user) {
    try {
        const data = JSON.parse(jsonResponse);
        
        let naturalResponse = '';
        
        if (data.title) {
            naturalResponse += `**${data.title}**\n\n`;
        }
        
        if (data.description) {
            naturalResponse += data.description + '\n\n';
        }
        
        if (data.fields && Array.isArray(data.fields)) {
            data.fields.forEach(field => {
                if (field.name && field.value) {
                    naturalResponse += `**${field.name}**\n${field.value}\n\n`;
                }
            });
        }
        
        if (!naturalResponse.trim()) {
            naturalResponse = `Hello ${user.displayName}! Welcome to ${guild.name}. I'd be happy to help you get started. What would you like to know about our server?`;
        }
        
        return naturalResponse.trim();
    } catch (error) {
        console.error('Error converting JSON to natural language:', error);
        return `Hello ${user.displayName}! I encountered an issue processing your request, but I'm here to help! What would you like to know about our server?`;
    }
}

// 📊 ADD CONTEXTUAL FIELDS BASED ON QUESTION TYPE
function addContextualFields(embed, config, promptType, guild) {
    const currentFields = embed.data.fields ? embed.data.fields.length : 0;
    
    if (currentFields >= 23) return; // Leave room
    
    if (promptType.includes('channel') && config.serverMetadata?.channels) {
        addChannelFields(embed, config);
    } else if (promptType.includes('role') && config.serverMetadata?.roles) {
        addRoleFields(embed, config);
    } else if ((promptType.includes('link') || promptType.includes('resource')) && config.links?.length > 0) {
        addLinkFields(embed, config);
    } else if (promptType.includes('welcome') || promptType.includes('getting started')) {
        addWelcomeFields(embed, config);
    }
}

function addChannelFields(embed, config) {
    const channels = config.serverMetadata.channels || [];
    const channelsByType = {};
    
    channels.forEach(channel => {
        const type = getChannelTypeDisplay(channel.type);
        if (!channelsByType[type]) channelsByType[type] = [];
        channelsByType[type].push(channel);
    });
    
    Object.entries(channelsByType).forEach(([type, chList]) => {
        if (embed.data.fields && embed.data.fields.length >= 25) return;
        
        const channelMentions = chList
            .slice(0, 12)
            .map(ch => `<#${ch.id}>`)
            .join(' • ');
        
        if (channelMentions) {
            embed.addFields({
                name: type,
                value: channelMentions,
                inline: false
            });
        }
    });
}

function addRoleFields(embed, config) {
    if (embed.data.fields && embed.data.fields.length >= 24) return;
    
    const roles = config.serverMetadata.roles || [];
    const importantRoles = roles
        .filter(role => role.name !== '@everyone' && !role.name.toLowerCase().includes('bot'))
        .slice(0, 15);
    
    if (importantRoles.length > 0) {
        const roleMentions = importantRoles
            .map(role => `<@&${role.id}>`)
            .join(' • ');
        
        embed.addFields({
            name: '🎭 Server Roles',
            value: roleMentions,
            inline: false
        });
    }
}

function addLinkFields(embed, config) {
    if (embed.data.fields && embed.data.fields.length >= 20) return;
    
    const linksByType = {};
    config.links.forEach(link => {
        const type = link.type.charAt(0).toUpperCase() + link.type.slice(1);
        if (!linksByType[type]) linksByType[type] = [];
        linksByType[type].push(link);
    });
    
    Object.entries(linksByType).forEach(([type, links]) => {
        if (embed.data.fields && embed.data.fields.length >= 25) return;
        
        const linkList = links
            .slice(0, 6)
            .map(link => `[${link.name}](${link.url})`)
            .join('\n');
        
        embed.addFields({
            name: `🔗 ${type} Resources`,
            value: linkList,
            inline: true
        });
    });
}

function addWelcomeFields(embed, config) {
    if (embed.data.fields && embed.data.fields.length >= 22) return;
    
    // Add quick start field
    if (config.serverMetadata?.channels) {
        const generalChannels = config.serverMetadata.channels
            .filter(ch => ch.type === '0' && (ch.name.includes('general') || ch.name.includes('chat')))
            .slice(0, 3);
        
        if (generalChannels.length > 0) {
            embed.addFields({
                name: '💬 Start Chatting',
                value: generalChannels.map(ch => `<#${ch.id}>`).join(' • '),
                inline: true
            });
        }
    }
    
    // Add helpful roles if available
    if (config.serverMetadata?.roles) {
        const memberRoles = config.serverMetadata.roles
            .filter(role => role.name.toLowerCase().includes('member') || role.name.toLowerCase().includes('user'))
            .slice(0, 2);
        
        if (memberRoles.length > 0) {
            embed.addFields({
                name: '👥 Your Roles',
                value: memberRoles.map(role => `<@&${role.id}>`).join(' • '),
                inline: true
            });
        }
    }
}

function getChannelTypeDisplay(type) {
    const typeMap = {
        '0': '📝 Text Channels',
        '2': '🔊 Voice Channels', 
        '4': '📂 Categories',
        '5': '📢 Announcements',
        '13': '🎤 Stage Channels',
        '15': '🏛️ Forum Channels'
    };
    return typeMap[type] || '📋 Other Channels';
}

// 🚀 MAIN FAQ RESPONSE FUNCTION
async function getFaqResponse(prompt, guildId, channelId, guild, user) {
    try {
        const config = await FaqConfig.findByGuild(guildId);
        if (!config) return null;

        const apiKey = config.getNextApiKey();
        if (!apiKey) {
            console.error('No active API keys available for guild:', guildId);
            return createErrorEmbed("FAQ system temporarily unavailable", "Please contact an administrator.", guild);
        }

        // Build enhanced context with user info
        const contextPrompt = buildEnhancedContext(config, prompt, guild, user);

        const response = await axios.post(
            `${GEMINI_API_URL}?key=${apiKey}`,
            {
                contents: [{
                    role: "user",
                    parts: [{ text: contextPrompt }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    topK: 35,
                    topP: 0.9,
                    maxOutputTokens: 1400,
                }
            }
        );

        // Increment usage
        await config.incrementUsage();
        await config.save();

        if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            const aiResponse = response.data.candidates[0].content.parts[0].text;
            return createAdvancedResponseEmbed(aiResponse, config, guild, prompt, user);
        }
        
        return createErrorEmbed("No Response Generated", "Please try rephrasing your question.", guild);
    } catch (error) {
        console.error('Error getting FAQ response:', error.response?.data || error.message);
        
        if (error.response?.status === 429) {
            return createErrorEmbed("High Demand", "Please try again in a moment.", guild);
        } else if (error.response?.status === 403) {
            return createErrorEmbed("API Configuration Issue", "Please contact an administrator.", guild);
        }
        
        return createErrorEmbed("Error Processing Request", "Please try again or contact support.", guild);
    }
}

// Create error embed
function createErrorEmbed(title, description, guild) {
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.error)
        .setTitle(`❌ ${title}`)
        .setDescription(description)
        .setTimestamp();
    
    if (guild) {
        embed.setAuthor({ 
            name: `${guild.name} FAQ Assistant`, 
            iconURL: guild.iconURL({ dynamic: true }) || undefined 
        });
    }
    
    return embed;
}

// 🚨 ENHANCED MESSAGE HANDLER WITH DISCORD TIMEOUT SUPPORT
async function handleFaqMessage(message) {
    if (message.author.bot || !message.guild) return false;
    
    const config = await FaqConfig.findByGuild(message.guild.id);
    if (!config || !config.enabled) return false;
    
    const isChannelEnabled = await FaqConfig.isChannelEnabled(message.guild.id, message.channel.id);
    if (!isChannelEnabled) return false;
    
    const prefix = config.prefix || '?';
    if (!message.content.startsWith(prefix)) return false;
    
    const question = message.content.slice(prefix.length).trim();
    if (!question || question.length < 3) {
        const helpEmbed = new EmbedBuilder()
            .setColor(EMBED_COLORS.warning)
            .setTitle('❓ FAQ Help')
            .setDescription(`Please provide a more detailed question.\n\n**Example:** \`${prefix}How do I get started?\``)
            .setAuthor({ 
                name: `${message.guild.name} FAQ Assistant`, 
                iconURL: message.guild.iconURL({ dynamic: true }) || undefined 
            })
            .setTimestamp();
        
        await message.reply({ embeds: [helpEmbed] });
        return true;
    }
    
    // 🔒 ENHANCED RATE LIMITING CHECK WITH DISCORD TIMEOUT SUPPORT
    updateUserInfo(message.author);
    const member = message.member;
    const rateLimitCheck = await checkRateLimit(message.author.id, member, message.guild);
    
    if (!rateLimitCheck.allowed) {
        const rateLimitEmbed = createRateLimitEmbed(message.author, rateLimitCheck);
        await message.reply({ embeds: [rateLimitEmbed] });
        
        // Enhanced logging with timeout type
        const timeoutType = rateLimitCheck.reason === 'DISCORD_TIMEOUT' ? 'Discord Timeout' : 'Virtual Timeout';
        console.log(`[FAQ ${timeoutType.toUpperCase()}] User ${message.author.tag} (${message.author.id}) blocked for ${rateLimitCheck.timeLeft}s. Violations: ${rateLimitCheck.violations}, Type: ${rateLimitCheck.timeoutType || 'MODERATE'}`);
        
        return true;
    }
    
    await message.channel.sendTyping();
    
    try {
        const responseEmbed = await getFaqResponse(question, message.guild.id, message.channel.id, message.guild, message.author);
        
        if (responseEmbed) {
            await message.reply({ embeds: [responseEmbed] });
            console.log(`[FAQ SUCCESS] ${message.author.tag} asked: "${question.substring(0, 50)}${question.length > 50 ? '...' : ''}"`);
        } else {
            const noResponseEmbed = createErrorEmbed(
                "Unable to Generate Response", 
                "Please try rephrasing your question or contact a moderator for help.", 
                message.guild
            );
            await message.reply({ embeds: [noResponseEmbed] });
        }
        
        return true;
    } catch (error) {
        console.error('Error handling FAQ message:', error);
        const errorEmbed = createErrorEmbed(
            "Processing Error", 
            "Sorry, I encountered an error. Please try again later.", 
            message.guild
        );
        await message.reply({ embeds: [errorEmbed] });
        return true;
    }
}

// 📊 ENHANCED ADMIN FUNCTIONS
function getUserStats(userId) {
    const cooldownData = userCooldowns.get(userId);
    const userInfoData = userInfo.get(userId);
    
    return {
        cooldown: cooldownData,
        info: userInfoData,
        nextRequestIn: getRemainingCooldown(userId),
        isDiscordTimedOut: cooldownData?.discordTimeoutApplied || false
    };
}

function getAllActiveUsers() {
    const stats = {
        totalUsers: userInfo.size,
        virtualTimeouts: 0,
        discordTimeouts: 0,
        timedOutUsers: 0,
        activeRequests: 0
    };
    
    const now = Date.now();
    for (const [userId, data] of userCooldowns.entries()) {
        if (data.blockedUntil > now) {
            stats.timedOutUsers++;
            if (data.discordTimeoutApplied) {
                stats.discordTimeouts++;
            } else {
                stats.virtualTimeouts++;
            }
        }
        stats.activeRequests += data.requestCount;
    }
    
    return stats;
}

// 🔧 UTILITY FUNCTIONS FOR ADMIN COMMANDS
function clearUserCooldown(userId) {
    const userData = userCooldowns.get(userId);
    if (userData) {
        userCooldowns.set(userId, {
            ...userData,
            blockedUntil: 0,
            violations: 0,
            discordTimeoutApplied: false
        });
        return true;
    }
    return false;
}

function getUserViolations(userId) {
    const userData = userCooldowns.get(userId);
    return userData ? userData.violations : 0;
}

function setUserViolations(userId, violations) {
    const userData = userCooldowns.get(userId);
    if (userData) {
        userCooldowns.set(userId, {
            ...userData,
            violations: Math.max(0, violations)
        });
        return true;
    }
    return false;
}

function getRateLimitStats() {
    const now = Date.now();
    const stats = {
        totalTrackedUsers: userCooldowns.size,
        currentlyBlocked: 0,
        virtualTimeouts: 0,
        discordTimeouts: 0,
        highViolationUsers: 0,
        totalViolations: 0,
        averageViolations: 0
    };
    
    let totalViolations = 0;
    let userCount = 0;
    
    for (const [userId, data] of userCooldowns.entries()) {
        totalViolations += data.violations;
        userCount++;
        
        if (data.violations >= RATE_LIMIT_CONFIG.maxViolationsBeforeDiscordTimeout) {
            stats.highViolationUsers++;
        }
        
        if (data.blockedUntil > now) {
            stats.currentlyBlocked++;
            if (data.discordTimeoutApplied) {
                stats.discordTimeouts++;
            } else {
                stats.virtualTimeouts++;
            }
        }
    }
    
    stats.totalViolations = totalViolations;
    stats.averageViolations = userCount > 0 ? (totalViolations / userCount).toFixed(2) : 0;
    
    return stats;
}

// 🎯 ADMIN EMBED CREATION
function createAdminStatsEmbed(guild) {
    const stats = getRateLimitStats();
    const globalStats = getAllActiveUsers();
    
    const embed = new EmbedBuilder()
        .setColor(EMBED_COLORS.info)
        .setTitle('📊 FAQ Rate Limiting Statistics')
        .setDescription('Current status of the FAQ rate limiting system')
        .addFields(
            { name: '👥 Total Users', value: `${globalStats.totalUsers} tracked users`, inline: true },
            { name: '🚫 Currently Blocked', value: `${stats.currentlyBlocked} users`, inline: true },
            { name: '⏱️ Virtual Timeouts', value: `${stats.virtualTimeouts} users`, inline: true },
            { name: '🔒 Discord Timeouts', value: `${stats.discordTimeouts} users`, inline: true },
            { name: '⚠️ High Violation Users', value: `${stats.highViolationUsers} users (3+ violations)`, inline: true },
            { name: '📈 Total Violations', value: `${stats.totalViolations} violations`, inline: true },
            { name: '📊 Average Violations', value: `${stats.averageViolations} per user`, inline: true },
            { name: '📋 Total Requests', value: `${globalStats.activeRequests} FAQ requests`, inline: true },
            { name: '⚙️ Settings', value: `Cooldown: ${RATE_LIMIT_CONFIG.cooldownTime / 1000}s\nDiscord Timeout: ${RATE_LIMIT_CONFIG.maxViolationsBeforeDiscordTimeout} violations`, inline: false }
        )
        .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
        .setFooter({ text: `FAQ Rate Limiting System • ${guild.name}` })
        .setTimestamp();
    
    return embed;
}

module.exports = {
    handleFaqMessage,
    getFaqResponse,
    getUserStats,
    getAllActiveUsers,
    RATE_LIMIT_CONFIG,
    applyDiscordTimeout,
    clearUserCooldown,
    getUserViolations,
    setUserViolations,
    getRateLimitStats,
    createAdminStatsEmbed
};
