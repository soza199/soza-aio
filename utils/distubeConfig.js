module.exports = {
    distubeOptions: {
        emitAddListWhenCreatingQueue: true,
        emitAddSongWhenCreatingQueue: false,
        emitNewSongOnly: true,
        joinNewVoiceChannel: true,
        nsfw: true,
        savePreviousSongs: true,
        // Use the full Discord player range. FFmpeg applies a small, limited
        // gain below so quiet masters are louder without clipping.
        volume: 100,
        ffmpeg: {
            args: {
                input: {
                    // YouTube media URLs can briefly stall or expire while a
                    // queue is playing. Let FFmpeg reconnect the input instead
                    // of dropping the voice stream.
                    reconnect: 1,
                    reconnect_streamed: 1,
                    reconnect_at_eof: 1,
                    reconnect_on_network_error: 1,
                    reconnect_delay_max: 5
                },
                output: {
                    // Keep Discord's native audio rate and smooth timestamp
                    // gaps from remote streams.
                    af: 'aresample=async=1:min_hard_comp=0.100:first_pts=0,acompressor=threshold=-18dB:ratio=1.6:attack=20:release=250:makeup=2dB,volume=1.12,alimiter=limit=0.95'
                }
            }
        }
    }
};
