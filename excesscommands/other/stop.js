function temporaryReply(message, content, timeout = 5000) {
    return message.reply(content).then(reply => {
        setTimeout(() => reply.delete().catch(() => {}), timeout);
        return reply;
    });
}

module.exports = {
    async execute(message, args, client) {
        const voiceChannel = message.member?.voice?.channel;
        if (!voiceChannel) {
            return temporaryReply(message, '❌ Join a voice channel first, then use `.stop`.');
        }

        const botVoiceChannel = message.guild.members.me?.voice?.channel;
        if (botVoiceChannel && botVoiceChannel.id !== voiceChannel.id) {
            return temporaryReply(message, '❌ Join the same voice channel as me to stop the music.');
        }

        const riffyPlayer = client.riffy?.players?.get(message.guild.id);
        const distubeQueue = client.distube?.getQueue?.(message.guild.id);

        if (!riffyPlayer && !distubeQueue) {
            return temporaryReply(message, '❌ The music system is not ready yet. Please try again shortly.');
        }

        const queueLength = riffyPlayer?.queue?.length || distubeQueue?.songs?.length || 0;

        try {
            if (riffyPlayer && client.musicMessageManager) {
                await client.musicMessageManager.cleanupGuildMessages(
                    client,
                    message.guild.id
                );
            }

            if (riffyPlayer) {
                riffyPlayer.destroy();
            }

            if (distubeQueue) {
                await client.distube.stop(message.guild.id);
            }

            return temporaryReply(
                message,
                `⏹️ Music stopped and queue cleared (${queueLength} track${queueLength === 1 ? '' : 's'} removed).`
            );
        } catch (error) {
            console.error('Prefix music stop error:', error);
            return temporaryReply(message, '❌ I could not stop the music. Please try again.');
        }
    }
};