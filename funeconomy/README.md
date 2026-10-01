# Fun Economy (gaya OwO)

Mata uang: **cash** (saldo global per user, terpisah dari economy lama `.balance`).
Command diketik **tanpa titik**, langsung di chat. Semua pengaturan ada di `funeconomy/config.js`.

| Command | Fungsi |
|---|---|
| `scash` | Cek saldo |
| `scf <jumlah\|all> [h/t]` | Coin flip (menang = 2x). Tanpa jumlah = taruhan 1 |
| `ss <jumlah\|all>` | Slots |
| `sdaily` | Hadiah harian + streak (reset 00:00 WIB) |
| `sgive @user <jumlah\|all>` | Kirim cash |
| `slb` | Leaderboard top 10 |

- Taruhan minimal **1**, maksimal **250,000**. `all` = `min(saldo, 250,000)`.
- Slots: 3 sama = 🍒x5, 🍆x8, ❤️x12, ⭕x30, 💵x100; tepat dua 🍒 = x2. RTP ~93%.
- `ss` tanpa angka diabaikan (supaya "ss" = screenshot di chat tidak memicu slots). Ubah lewat `SLOTS_REQUIRE_AMOUNT`.
- Ganti emoji (mis. emoji custom server) di `CASH_EMOJI`, `COIN`, dan `SLOT_SPINNING`.

## Struktur
- `events/funEconomy.js` - listener `messageCreate` (dimuat otomatis oleh `handlers/events.js`)
- `funeconomy/index.js` - dispatcher prefix `s` + loader command
- `funeconomy/commands/*.js` - satu file per command (tambah file baru = command baru)
- `models/funeconomy/` - schema & operasi database (taruhan diproses atomik)
