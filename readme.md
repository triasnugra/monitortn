# monitortn
Monitor mesin tn, tnv2, tnv2c2. Situs: https://triasnugra.github.io/monitortn/
Pasang: upload semua file ke repo `monitortn` (GitHub web UI), lalu Settings > Pages > Source: **GitHub Actions**. Jalankan Actions > deploy > Run workflow (file lama .github/workflows/monitor.yml dihapus, diganti deploy.yml).
Repo mesin privat: buat token (read contents) dan simpan sebagai secret `MONITOR_TOKEN`.
Nama repo mesin diatur di `config.json`. Postingan @eliz883 baru: tambahkan ke `data/eliz-posts.json` (format tgl + teks). Salin "Laporan untuk Claude" dari situs ke chat.

Pembaruan v2: scripts/overlay.mjs (kondisi pasar, EUR/USD info, konfirmasi 4H/12H, audit keputusan, diagnostik candle bolong). Mesin tidak diubah.

v2.2: kolom Laporan untuk Claude (maks 3, snapshot tiap 3 hari, status biru/hijau, input tanggal lapor di browser).

v4: lapisan uji ala Van Tharp (SQN, biaya impas dan sensitivitas biaya, distribusi R, konsentrasi trade teratas).

v5.1: laporan harian yang terlewat direkonstruksi dari jurnal (3 hari terakhir), diberi label REKONSTRUKSI.

v6 (kalender makro): scripts/makro.mjs + data/events.json. Peringatan FOMC, CPI, NFP, risalah FOMC, dan kedaluwarsa opsi Deribit (banner di atas, tabel "Kalender makro", masuk ke Warning dan ke "Laporan untuk Claude"). Ada juga "Uji jendela event": R/trade trade yang dibuka dekat rilis vs di luar jendela (hipotesis, jangan dijadikan aturan sebelum puluhan trade). Mesin tidak diubah.
v7 (kalender berkelanjutan): scripts/kalender-sync.mjs mengambil jadwal resmi terbaru dari bls.gov (CPI, NFP) dan federalreserve.gov (FOMC, termasuk rapat strategi tanpa keputusan) di setiap build, di-cache 6 jam di site/kalender-auto.json supaya tidak membebani situs sumber. Tahun 2028 dan seterusnya masuk sendiri begitu BLS/Fed menerbitkannya; opsi Deribit dan risalah FOMC dihitung otomatis tanpa batas. Bila sumber gagal/diblok: memakai cache terakhir, lalu data/events.json (statis) dan muncul peringatan. Status sinkron tampil di tabel Kalender makro. Waktu 'et' = waktu New York; kode mengubahnya ke UTC/WIB sendiri (DST AS). Jendela dan ambang bisa diubah di config.json bagian "makro".

v8 (UI): tab filter mesin (Semua/tn/tnv2/tnv2c2) di Sinyal menunggu (terbaru ke terlama), pagination 15 baris/halaman di Sinyal menunggu dan Jurnal analisis (reset ke halaman 1 saat ganti tab/cari koin), tombol Download Excel (.xlsx) berisi SELURUH data (library SheetJS di vendor/xlsx.full.min.js, disalin ke situs oleh build.mjs). Data utama tidak diubah; hanya tampilan yang dipotong.
