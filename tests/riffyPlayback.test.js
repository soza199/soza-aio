const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
    getRiffyQueuePosition,
    startRiffyPlayerAndWaitForStart
} = require('../utils/riffyPlayback');

test('queue positions start at one for an idle player and include queued tracks', () => {
    assert.equal(getRiffyQueuePosition({ queue: [] }), 1);
    assert.equal(getRiffyQueuePosition({ queue: [{}, {}], current: null }), 3);
    assert.equal(getRiffyQueuePosition({ queue: [], current: {}, playing: true }), 1);
});

test('playback startup waits for a matching Riffy trackStart event', async () => {
    const riffy = new EventEmitter();
    const startedTrack = { info: { title: 'Test track' } };
    let playCalls = 0;
    const player = {
        queue: [startedTrack],
        playing: false,
        paused: false,
        play: async () => {
            playCalls += 1;
            setImmediate(() => riffy.emit('trackStart', player, startedTrack));
        }
    };

    const result = await startRiffyPlayerAndWaitForStart(player, riffy, 100);
    assert.equal(result, startedTrack);
    assert.equal(playCalls, 1);
    assert.equal(riffy.listenerCount('trackStart'), 0);
});

test('playback startup rejects when Lavalink never confirms a track start', async () => {
    const riffy = new EventEmitter();
    const player = {
        queue: [{}],
        playing: false,
        paused: false,
        play: async () => {}
    };

    await assert.rejects(
        startRiffyPlayerAndWaitForStart(player, riffy, 5),
        /did not start playback/
    );
    assert.equal(riffy.listenerCount('trackStart'), 0);
});
