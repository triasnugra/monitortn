# monitortn
Monitor mesin tn, tnv2, tnv2c2. Situs: https://triasnugra.github.io/monitortn/
Pasang: upload semua file ke repo `monitortn` (GitHub web UI), lalu Settings > Pages > Source: **GitHub Actions**. Jalankan Actions > monitor > Run workflow.
Repo mesin privat: buat token (read contents) dan simpan sebagai secret `MONITOR_TOKEN`.
Nama repo mesin diatur di `config.json`. Postingan @eliz883 baru: tambahkan ke `data/eliz-posts.json` (format tgl + teks). Salin "Laporan untuk Claude" dari situs ke chat.

Pembaruan v2: scripts/overlay.mjs (kondisi pasar, EUR/USD info, konfirmasi 4H/12H, audit keputusan, diagnostik candle bolong). Mesin tidak diubah.

v2.2: kolom Laporan untuk Claude (maks 3, snapshot tiap 3 hari, status biru/hijau, input tanggal lapor di browser).

v4: lapisan uji ala Van Tharp (SQN, biaya impas dan sensitivitas biaya, distribusi R, konsentrasi trade teratas).

v5: kolom laporan harian (per tanggal WIB, tampil 3 hari, maks 3 harian + 1 live).
