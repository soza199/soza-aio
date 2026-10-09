/**
 * Shared help menu for /help and prefix help.
 *
 * Views:
 *  - Home: command count and category dropdown (paged), with Prev/Next navigation.
 *  - Category: category dropdown, section jump menu, and page navigation.
 *  - Detail: /help command:<name> or .help <name>
 */
const fs = require('fs');
const path = require('path');
const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    MessageFlags,
} = require('discord.js');
const config = require('../config.json');

const CODE_EMOJI = '<:code:1555825017080647760>';
const EMBED_COLOR = 0xFFFFFF;
const CATEGORY_PAGE_SIZE = 10;
const FIELD_LIMIT = 1000;
const MAX_LINE = 300;

const CATEGORY_META = {
    basic:      { label: 'Basic Commands',        emoji: 'ℹ️' },
    core:       { label: 'Core Commands',         emoji: '⚙️' },
    setups:     { label: 'Setup & Configuration', emoji: CODE_EMOJI },
    moderation: { label: 'Moderation',            emoji: '🛡️' },
    utility:    { label: 'Utility',               emoji: '🧰' },
    fun:        { label: 'Fun',                   emoji: '🎮' },
    funeconomy: { label: 'Fun Economy',           emoji: '💰' },
    media:      { label: 'Media',                 emoji: '🖼️' },
    audio:      { label: 'Audio',                 emoji: '🔊' },
    lavalink:   { label: 'Music (Lavalink)',      emoji: '🎶' },
    other:      { label: 'Prefix Commands',       emoji: '📦' },
};
const CATEGORY_ORDER = Object.keys(CATEGORY_META);

const FUN_ECONOMY_INFO = {
    cash:    { usage: '',                           desc: 'Check your cash balance' },
    daily:   { usage: '',                           desc: 'Claim your daily reward' },
    give:    { usage: '@user <amount|all>',         desc: 'Give cash to another user' },
    cf:      { usage: '<amount|all> [h/t]',         desc: 'Flip a coin, win 2x' },
    s:       { usage: '<amount|all>',               desc: 'Play slots' },
    bj:      { usage: '<amount|all>',               desc: 'Play blackjack' },
    lottery: { usage: '[amount|all]',               desc: 'Join the daily lottery' },
    drop:    { usage: '<amount|all>',               desc: 'Drop cash in this channel' },
    pickup:  { usage: '',                           desc: 'Pick up cash dropped in this channel' },
    lb:      { usage: '[category] [global] [1-25]', desc: 'Show the leaderboard' },
    my:      { usage: '[category] [global]',        desc: 'Show your leaderboard rank' },
};

const FUN_ECONOMY_FILE_NAMES = {
    blackjack: 'bj',
    coinflip: 'cf',
    leaderboard: 'lb',
    slots: 's',
};

const clip = (text, max) => {
    const t = String(text ?? '').replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

const titleCase = (s) => s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

function parseEmoji(value) {
    const m = /^<(a?):(\w+):(\d+)>$/.exec(value || '');
    return m ? { id: m[3], name: m[2], animated: Boolean(m[1]) } : value;
}

function optionUsage(options = []) {
    return options
        .filter((o) => o.type > 2)
        .map((o) => (o.required ? `<${o.name}>` : `[${o.name}]`))
        .join(' ');
}

function flattenSubs(json) {
    const subs = [];
    for (const opt of json.options || []) {
        if (opt.type === 1) {
            subs.push({ path: opt.name, usage: optionUsage(opt.options), description: clip(opt.description, 80) });
        } else if (opt.type === 2) {
            for (const child of opt.options || []) {
                if (child.type !== 1) continue;
                subs.push({
                    path: `${opt.name} ${child.name}`,
                    usage: optionUsage(child.options),
                    description: clip(child.description, 80),
                });
            }
        }
    }
    return subs;
}

async function getPrefixInfo(guildId) {
    let server = null;
    try {
        const ServerConfig = require('../models/serverConfig/schema');
        const doc = await ServerConfig.findOne({ serverId: guildId }).lean();
        server = doc?.prefix || null;
    } catch (_) { /* use the default prefix */ }
    const def = config.prefix || '.';
    return { default: def, server, effective: server || def };
}

let catalogCache = { key: null, time: 0, data: null };

function loadPrefixEntries(prefix) {
    const entries = [];
    const base = path.join(__dirname, '..', 'excesscommands');
    for (const [folder, enabled] of Object.entries(config.excessCommands || {})) {
        if (!enabled) continue;
        const dir = path.join(base, folder);
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
            const name = path.basename(file, '.js');
            if (name === 'help') continue;
            try {
                const cmd = require(path.join(dir, file));
                entries.push({
                    category: folder,
                    name,
                    prefix,
                    usage: '',
                    description: clip(cmd.description || 'No description', 70),
                    aliases: cmd.aliases || [],
                    subs: [],
                });
            } catch (err) {
                console.error(`[HELP] Could not load ${file}:`, err.message);
                entries.push({
                    category: folder,
                    name,
                    prefix,
                    usage: '',
                    description: 'No description',
                    aliases: [],
                    subs: [],
                });
            }
        }
    }
    return entries;
}

function loadFunEconomyEntries() {
    const entries = [];
    const dir = path.join(__dirname, '..', 'funeconomy', 'commands');
    if (!fs.existsSync(dir)) return entries;
    let econPrefix = 's';
    try { econPrefix = require('../funeconomy/config').PREFIX || 's'; } catch (_) { /* use default */ }

    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.js'))) {
        try {
            const cmd = require(path.join(dir, file));
            const info = FUN_ECONOMY_INFO[cmd.name] || {};
            entries.push({
                category: 'funeconomy',
                name: cmd.name,
                prefix: econPrefix,
                usage: info.usage || '',
                description: info.desc || 'Fun Economy command',
                aliases: cmd.aliases || [],
                subs: [],
            });
        } catch (err) {
            console.error(`[HELP] Could not load funeconomy/${file}:`, err.message);
            const name = FUN_ECONOMY_FILE_NAMES[file.replace(/\.js$/, '')] || file.replace(/\.js$/, '');
            const info = FUN_ECONOMY_INFO[name] || {};
            entries.push({
                category: 'funeconomy',
                name,
                prefix: econPrefix,
                usage: info.usage || '',
                description: info.desc || 'Fun Economy command',
                aliases: [],
                subs: [],
            });
        }
    }
    return entries;
}

function buildCatalog(client, prefix) {
    if (catalogCache.data && catalogCache.key === prefix && Date.now() - catalogCache.time < 30000) {
        return catalogCache.data;
    }

    const all = [];
    for (const [, cmd] of client.commands || []) {
        if (!cmd?.data?.toJSON || cmd.registerGuildOnly) continue;
        const json = cmd.data.toJSON();
        all.push({
            category: cmd.category || 'misc',
            name: json.name,
            prefix: '/',
            usage: optionUsage(json.options),
            description: clip(json.description, 70),
            aliases: [],
            subs: flattenSubs(json),
        });
    }

    all.push(...loadPrefixEntries(prefix), ...loadFunEconomyEntries());

    const byCat = new Map();
    for (const entry of all) {
        if (!byCat.has(entry.category)) byCat.set(entry.category, []);
        byCat.get(entry.category).push(entry);
    }

    const keys = [...byCat.keys()].sort((a, b) => {
        const ia = CATEGORY_ORDER.indexOf(a);
        const ib = CATEGORY_ORDER.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
    });

    const categories = keys.map((key) => {
        const meta = CATEGORY_META[key] || { label: titleCase(key), emoji: '📁' };
        const entries = byCat.get(key);
        return {
            key,
            label: meta.label,
            emoji: meta.emoji,
            entries,
            blocks: buildBlocks(entries),
            commandCount: entries.reduce((n, e) => n + (e.subs.length || 1), 0),
        };
    });

    const data = { categories, entries: all };
    catalogCache = { key: prefix, time: Date.now(), data };
    return data;
}

const entryLine = (e) =>
    `\`${e.prefix}${e.name}${e.usage ? ` ${e.usage}` : ''}\` — ${e.description}`;
const subLine = (e, s) =>
    `\`${e.prefix}${e.name} ${s.path}${s.usage ? ` ${s.usage}` : ''}\` — ${s.description}`;

function buildBlocks(entries) {
    const blocks = [];
    const plain = entries.filter((e) => !e.subs.length);
    const grouped = entries.filter((e) => e.subs.length);
    if (plain.length) blocks.push({ title: 'General', lines: plain.map(entryLine) });
    for (const e of grouped) {
        blocks.push({ title: titleCase(e.name), lines: e.subs.map((s) => subLine(e, s)) });
    }
    return blocks;
}

function paginate(blocks) {
    const pages = [];
    const sections = [];
    const seen = new Set();
    let cur = [];
    let len = 0;

    const flush = () => {
        if (cur.length) pages.push(cur.join('\n'));
        cur = [];
        len = 0;
    };

    for (const block of blocks) {
        const header = `> ———**${block.title}**———`;
        let needHeader = true;
        for (const rawLine of block.lines) {
            const line = `> ${clip(rawLine, MAX_LINE)}`;
            const need = line.length + 1 + (needHeader ? header.length + 1 : 0);
            if (len + need > FIELD_LIMIT && cur.length) {
                flush();
                needHeader = true;
            }
            if (needHeader) {
                if (!seen.has(block.title)) {
                    seen.add(block.title);
                    sections.push({ title: block.title, page: pages.length });
                }
                cur.push(header);
                len += header.length + 1;
                needHeader = false;
            }
            cur.push(line);
            len += line.length + 1;
        }
    }
    flush();
    if (!pages.length) pages.push('> No commands in this category.');
    return { pages, sections };
}

function findEntry(catalog, query) {
    const q = String(query || '').trim().toLowerCase().replace(/^[/]/, '').split(/\s+/)[0];
    if (!q) return null;
    const matches = (e) =>
        e.name.toLowerCase() === q ||
        e.aliases.some((a) => a.toLowerCase() === q) ||
        `${e.prefix}${e.name}`.toLowerCase() === q;
    return catalog.entries.find(matches) || null;
}

class HelpSession {
    constructor({ client, userId, prefixInfo }) {
        this.client = client;
        this.userId = userId;
        this.prefixInfo = prefixInfo;
        this.catalog = buildCatalog(client, prefixInfo.effective);
        this.state = { view: 'home', sel: 0, cat: 0, page: 0, entry: null };
        this.pageCache = new Map();
    }

    get totalSel() {
        return Math.max(1, Math.ceil(this.catalog.categories.length / CATEGORY_PAGE_SIZE));
    }

    footer() {
        const p = this.prefixInfo;
        return { text: `Default: ${p.default} | Server: ${p.server || '—'} | Self: —` };
    }

    paged(catIdx) {
        if (!this.pageCache.has(catIdx)) {
            this.pageCache.set(catIdx, paginate(this.catalog.categories[catIdx].blocks));
        }
        return this.pageCache.get(catIdx);
    }

    homeEmbed() {
        const total = this.catalog.categories.reduce((n, c) => n + c.commandCount, 0);
        return new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`${CODE_EMOJI} ${this.client.user.username} Commands`)
            .setDescription(
                `> ⚠️ Use the dropdown to view the Categories\n` +
                `> 📚 **${total}** commands in **${this.catalog.categories.length}** categories\n` +
                `> 🔎 Details: \`/help command:<name>\` or \`${this.prefixInfo.default}help <name>\``
            )
            .setFooter(this.footer());
    }

    categoryEmbed() {
        const cat = this.catalog.categories[this.state.cat];
        const { pages } = this.paged(this.state.cat);
        return new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`${CODE_EMOJI} ${cat.label} — Page ${this.state.page + 1}/${pages.length}`)
            .addFields({ name: 'Commands', value: pages[this.state.page] })
            .setFooter(this.footer());
    }

    detailEmbed(entry) {
        const cat = this.catalog.categories.find((c) => c.key === entry.category);
        const embed = new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`${CODE_EMOJI} ${entry.prefix}${entry.name}`)
            .setDescription(`> ${entry.description}\n> **Category:** ${cat ? cat.label : titleCase(entry.category)}`)
            .setFooter(this.footer());

        embed.addFields({
            name: 'Usage',
            value: `\`${entry.prefix}${entry.name}${entry.usage ? ` ${entry.usage}` : ''}\``,
        });

        if (entry.aliases.length) {
            embed.addFields({
                name: 'Aliases',
                value: entry.aliases.map((a) => `\`${entry.prefix}${a}\``).join(', ').slice(0, 1000),
            });
        }

        if (entry.subs.length) {
            let text = '';
            let shown = 0;
            for (const s of entry.subs) {
                const line = `> ${subLine(entry, s)}\n`;
                if (text.length + line.length > 900) break;
                text += line;
                shown++;
            }
            if (shown < entry.subs.length) text += `> …and ${entry.subs.length - shown} more`;
            embed.addFields({ name: `Subcommands (${entry.subs.length})`, value: text.trim() });
        }
        return embed;
    }

    notFoundEmbed(query) {
        return new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle(`${CODE_EMOJI} Command Not Found`)
            .setDescription(`> \`${clip(query, 50)}\` doesn't exist.\n> Use the dropdown below to browse all commands.`)
            .setFooter(this.footer());
    }

    categorySelect() {
        const { sel, view } = this.state;
        const cats = this.catalog.categories;
        const start = sel * CATEGORY_PAGE_SIZE;
        const options = cats.slice(start, start + CATEGORY_PAGE_SIZE).map((c, i) => ({
            label: clip(c.label, 100),
            description: clip(`View ${c.label} commands`, 100),
            value: `cat_${start + i}`,
            emoji: parseEmoji(c.emoji),
        }));
        if (sel > 0) {
            options.push({ label: 'Previous categories', description: `Go to page ${sel}/${this.totalSel}`, value: 'nav_prev', emoji: '⬅️' });
        }
        if (sel < this.totalSel - 1) {
            options.push({ label: 'More categories', description: `Go to page ${sel + 2}/${this.totalSel}`, value: 'nav_next', emoji: '➡️' });
        }
        if (view !== 'home') {
            options.push({ label: 'Home', description: 'Back to the main menu', value: 'nav_home', emoji: '🏠' });
        }
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('help_cat')
                .setPlaceholder(`➡️ Select a category... (page ${sel + 1}/${this.totalSel})`)
                .addOptions(options)
        );
    }

    jumpSelect() {
        const { cat, page } = this.state;
        const { pages, sections } = this.paged(cat);
        let current = 0;
        sections.forEach((s, i) => { if (s.page <= page) current = i; });
        let from = 0;
        if (sections.length > 24) from = Math.min(Math.max(0, current - 12), sections.length - 24);
        const options = [{ label: 'View All', description: 'Start from the first page', value: 'jump_0_all', emoji: '📋' }];
        sections.slice(from, from + 24).forEach((s, i) => {
            options.push({
                label: clip(s.title, 100),
                description: `Page ${s.page + 1}/${pages.length}`,
                value: `jump_${s.page}_${from + i}`,
            });
        });
        return new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('help_jump')
                .setPlaceholder('📋 View All')
                .addOptions(options)
        );
    }

    navButtons() {
        const { view, sel, page, cat } = this.state;
        let prevDisabled;
        let nextDisabled;
        if (view === 'home') {
            prevDisabled = sel <= 0;
            nextDisabled = sel >= this.totalSel - 1;
        } else {
            const total = this.paged(cat).pages.length;
            prevDisabled = page <= 0;
            nextDisabled = page >= total - 1;
        }
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('help_prev').setLabel('⬅️ Prev').setStyle(ButtonStyle.Secondary).setDisabled(prevDisabled),
            new ButtonBuilder().setCustomId('help_next').setLabel('Next ➡️').setStyle(ButtonStyle.Secondary).setDisabled(nextDisabled)
        );
    }

    backButton() {
        return new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('help_home').setLabel('Back').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
        );
    }

    render() {
        const { view } = this.state;
        if (view === 'detail') {
            return { embeds: [this.detailEmbed(this.state.entry)], components: [this.backButton()] };
        }
        if (view === 'notfound') {
            return { embeds: [this.notFoundEmbed(this.state.query)], components: [this.categorySelect(), this.navButtons()] };
        }
        if (view === 'category') {
            return {
                embeds: [this.categoryEmbed()],
                components: [this.categorySelect(), this.jumpSelect(), this.navButtons()],
            };
        }
        return { embeds: [this.homeEmbed()], components: [this.categorySelect(), this.navButtons()] };
    }

    openQuery(query) {
        const entry = findEntry(this.catalog, query);
        if (entry) {
            this.state.view = 'detail';
            this.state.entry = entry;
        } else {
            this.state.view = 'notfound';
            this.state.query = query;
        }
    }

    handle(i) {
        const s = this.state;
        if (i.isStringSelectMenu()) {
            const value = i.values[0];
            if (i.customId === 'help_cat') {
                if (value === 'nav_prev') s.sel = Math.max(0, s.sel - 1);
                else if (value === 'nav_next') s.sel = Math.min(this.totalSel - 1, s.sel + 1);
                else if (value === 'nav_home') s.view = 'home';
                else if (value.startsWith('cat_')) {
                    s.cat = parseInt(value.slice(4), 10);
                    s.page = 0;
                    s.sel = Math.floor(s.cat / CATEGORY_PAGE_SIZE);
                    s.view = 'category';
                }
            } else if (i.customId === 'help_jump') {
                s.page = parseInt(value.split('_')[1], 10) || 0;
            }
        } else if (i.isButton()) {
            if (i.customId === 'help_home') {
                s.view = 'home';
            } else if (i.customId === 'help_prev' || i.customId === 'help_next') {
                const dir = i.customId === 'help_prev' ? -1 : 1;
                if (s.view === 'category') {
                    const total = this.paged(s.cat).pages.length;
                    s.page = Math.min(Math.max(0, s.page + dir), total - 1);
                } else {
                    s.sel = Math.min(Math.max(0, s.sel + dir), this.totalSel - 1);
                }
            }
        }
    }
}

async function runHelp({ client, userId, guildId, query, send }) {
    const prefixInfo = await getPrefixInfo(guildId);
    const session = new HelpSession({ client, userId, prefixInfo });

    if (query) session.openQuery(query);

    const message = await send(session.render());
    if (!message?.createMessageComponentCollector) return;

    const collector = message.createMessageComponentCollector({ time: 600000, idle: 180000 });

    collector.on('collect', async (i) => {
        if (i.user.id !== userId) {
            return i.reply({
                content: '⚠️ Only the person who ran this command can use this menu.',
                flags: MessageFlags.Ephemeral,
            }).catch(() => {});
        }
        try {
            session.handle(i);
            await i.update(session.render());
        } catch (err) {
            console.error('[HELP] Menu update failed:', err);
        }
    });

    collector.on('end', () => {
        message.edit({ components: [] }).catch(() => {});
    });
}

function listCommandNames(client) {
    const catalog = buildCatalog(client, config.prefix || '.');
    return [...new Set(catalog.entries.map((e) => e.name))];
}

module.exports = { runHelp, listCommandNames, CODE_EMOJI };