# Fun Economy (gaya OwO)

Mata uang: **cash** (saldo global per user, terpisah dari economy lama `.balance`).
Command diketik **tanpa titik**, langsung di chat. Semua pengaturan ada di `funeconomy/config.js`.

| Command | Alias | Fungsi |
|---|---|---|
| `scash` | bal, balance, money, credit, currency | Cek saldo |
| `sdaily` | | Hadiah harian + streak (reset 00:00 WIB) |
| `sgive @user <jumlah\|all>` | send | Kirim cash |
| `scf <jumlah\|all> [h/t]` | coinflip, coin, flip | Coin flip (menang = 2x) |
| `ss <jumlah\|all>` | slots, slot | Slots (lihat tabel di bawah) |
| `sbj <jumlah\|all>` | blackjack | Blackjack dengan tombol Hit/Stand. Ketik ulang `sbj` untuk melanjutkan game |
| `slottery [jumlah\|all]` | bet, lotto | Lottery harian, satu pool untuk semua server |
| `sdrop <jumlah\|all>` | | Taruh cash di channel |
| `spickup` | | Ambil semua cash yang di-drop di channel ini |
| `slb [kategori] [global] [1-25]` | leaderboard, rank, ranking | Ranking cash, streak, level, atau total cash per-server |
| `smy [kategori] [global]` | me | Posisi kamu di ranking |

Kategori ranking: `cash` (default), `daily`, `level`, `guild`. Tanpa `global` = server ini.
Contoh: `slb`, `slb global`, `slb daily 5`, `slb level g`, `slb guild`, `smy`, `smy cash global`.

- Cooldown **15 detik** per game untuk `ss`, `scf`, `sbj` (per user). Dipakai bersama command prefix dan slash; ubah di `COOLDOWNS` pada `config.js` (0 = mati).
- Taruhan minimal **1**, maksimal **250,000**. `all` = `min(saldo, 250,000)`.
- Slots (odds OwO, RTP 95%): 🍆🍆🍆 x1 (20%), ❤️❤️❤️ x2 (20%), 🍒🍒🍒 x3 (5%), cash x3 x4 (2.5%), ⭕🇼⭕ x10 (1%).
- Blackjack: menang 2x, seri = taruhan kembali, dealer berhenti di 17, tepat 21 otomatis stand.
- Lottery: peluang menang = taruhanmu / total pool, maksimal 250,000 per lottery per user. Undian otomatis setiap pergantian hari; pemenang menerima seluruh pool dan DM.
- `ss` tanpa angka diabaikan (supaya "ss" = screenshot di chat tidak memicu slots). Ubah lewat `SLOTS_REQUIRE_AMOUNT`.
- Ganti emoji (mis. emoji custom server) di `CASH_EMOJI`, `COIN`, `SLOT_EMOJI`, dan `SLOT_SPINNING`.
- Ranking per-server memakai server tempat user memakai command, lalu mengisi akun lama dari daftar anggota saat ranking server dibuka.

## Struktur
- `events/funEconomy.js` - listener `messageCreate` (dimuat otomatis oleh `handlers/events.js`)
- `funeconomy/index.js` - dispatcher prefix `s` + loader command
- `funeconomy/commands/*.js` - satu file per command (tambah file baru = command baru)
- `events/funEconomyInteraction.js` - tombol blackjack; `events/funEconomyReady.js` - jadwal lottery
- `models/funeconomy/` - schema & operasi database (taruhan diproses atomik)

## Slash commands

Perintah slash memakai saldo cash global yang sama:

- `/economy balance [user]`
- `/economy daily`
- `/economy slots bet`
- `/economy coinflip bet side`
- `/economy give user amount`
- `/economy leaderboard`
- `/fun slots bet` dan `/fun coinflip bet side` juga memakai saldo cash baru.

Perintah lama `/economy work`, `beg`, `deposit`, `withdraw`, serta `/fun lottery` dan
`blackjack` tidak lagi didaftarkan. Jalankan ulang bot agar Discord memperbarui daftar slash command.

## Perintah pembuat bot

`/addcash user amount` menambahkan hingga 1.000.000.000 cash ke pengguna. Isi `DISCORD_USER_ID`
dengan Discord user ID pembuat bot. Isi juga `DISCORD_GUILD_ID` di Railway dengan ID server tempat
command tersedia. Command hanya didaftarkan di server itu, dibatasi ke admin oleh Discord, lalu bot
memeriksa ID pemilik sebelum menambah saldo. Untuk menyembunyikannya dari admin lain juga, batasi
`/addcash` ke pengguna pembuat bot di **Server Settings → Integrations → bot → Commands**.

Command slash lainnya tetap didaftarkan secara global. Pemisahan ini menjaga jumlah global di bawah
batas 100 command Discord.
