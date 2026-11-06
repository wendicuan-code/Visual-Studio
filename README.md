# Batam Video Studio

Editor video lokal berbahasa Indonesia, dibangun di atas proyek Remotion yang sudah ada. Komposisi promosi **HelloWorld** tetap tersedia melalui Remotion Studio.

## Menjalankan

Memerlukan Node.js 20.19+, 22.13+, atau 24+. Proyek ini diverifikasi dengan Node 24 di Windows, RAM 16 GB.

```powershell
npm install
npm run dev
```

Buka **http://127.0.0.1:5173**. Satu perintah menjalankan Vite dan backend Node pada **http://127.0.0.1:4310**. Hentikan dengan Ctrl+C. Aplikasi terikat ke loopback laptop; tampilan HP dapat digunakan melalui mode responsif browser. Akses dari perangkat lain melalui jaringan belum disediakan.

Komposisi Remotion asli:

```powershell
npm run studio
```

Build frontend dan komposisi:

```powershell
npm run build
```

## Alur penggunaan

1. Pilih **Create Video**, beri nama, lalu unggah foto JPG/PNG/WebP dan video MP4/WebM. Maksimum 250 MB per file, 100 adegan, durasi media/proyek maksimum 30 menit. File diproses satu per satu mengikuti urutan file yang dipilih. Progres upload berasal dari jaringan; sesudah 100%, backend memeriksa media dan membuat thumbnail.
2. Seret adegan atau gunakan tombol naik/turun. Pilih adegan untuk mengatur durasi foto, trim video, volume/mute, Fit/Fill, posisi, gerakan foto, dan transisi. Transisi masuk mengurangi total durasi sesuai overlap, maksimal setengah masing-masing klip. Timeline dibulatkan ke frame yang dipakai.
3. Pilih template **Properti Elegan**, **Minimalis**, atau **Promosi Dinamis**. Template mengubah font, warna, gerakan dan transisi adegan. Warna/font/posisi/latar teks dapat diubah manual. **Perintah Edit AI** tersimpan terpisah dari fakta unit dan belum diproses AI.
4. Isi **Deskripsi Unit**. **Susun Teks Adegan** membagikan setiap baris ke adegan secara deterministik; sisa baris masuk ke adegan terakhir. Tinjau judul dan teks tiap adegan. Harga tidak dibuat otomatis. Teks yang panjang menampilkan peringatan.
5. Unggah logo PNG/WebP, atur posisi/ukuran/opacity, lalu isi kontak. Kontak dapat muncul sepanjang video atau pada 3 detik terakhir.
6. Unggah musik dan voice-over MP3/WAV/M4A/OGG. Atur waktu mulai, volume, fade, serta pengulangan musik. Ducking menurunkan musik menjadi 30% dari volume pilihan selama trek voice-over atau klip bersuara aktif; ini berdasarkan rentang trek, bukan deteksi aktivitas ucapan berbasis AI. Audio yang lebih panjang dipotong saat video berakhir. Audio pendek diulang jika pengulangan aktif, atau berhenti dengan sisa hening.
7. Gunakan **Simpan Draf** atau tunggu autosave sekitar 1,3 detik setelah berhenti mengedit. Navigasi menunggu penyimpanan selesai. Perubahan belum tersimpan ditandai dan browser memberi peringatan saat menutup halaman.
8. **Export Video**: pilih 720p/1080p, 24/30 fps, nama file dan subtitle menyatu. Hasil MP4 H.264 masuk **Hasil Video** dengan progres render sebenarnya, thumbnail, Putar, Unduh, Buka Proyek, dan penghapusan dengan konfirmasi.

## Auto Subtitle lokal

Buka panel **Subtitle**, lalu pilih **Unduh & siapkan model lokal**. Konfirmasi unduhan ditampilkan sebelum proses dijalankan.

- Mesin: Transformers.js + ONNX Runtime CPU, model `onnx-community/whisper-tiny_timestamped`, quantized q8.
- Unduhan awal sekitar **150–250 MB**, memerlukan internet ke Hugging Face dan ruang disk untuk cache. RAM saat transkripsi kira-kira **1–2 GB**, bergantung panjang audio. Model yang sudah tersedia digunakan dari cache lokal; proses transkripsi tidak mengunggah audio.
- Tidak memerlukan Python, program FFmpeg sistem, GPU, kunci API, atau API berbayar. FFmpeg/FFprobe disertakan melalui dependensi npm. Runtime ONNX memiliki komponen native dan harus dapat dipasang sesuai sistem operasi.
- Sumber: suara video aktif, voice-over, atau keduanya. Musik bukan sumber transkripsi. Bahasa: Indonesia, Inggris, atau deteksi otomatis.
- Whisper menghasilkan teks dan **timestamp per kata yang nyata**. Model Tiny mengutamakan ringan; nama tempat/orang dan ejaan dapat keliru. Tinjau hasil sebelum dipublikasikan.
- Progress transkripsi menunjukkan sumber yang sudah selesai, bukan perkiraan palsu per token. Selama inferensi satu sumber, bar tidak bergerak sampai sumber selesai; status proses tetap ditampilkan.
- Subtitle sumber disimpan relatif ke file asli. Waktu tampilan mengikuti trim, transisi, dan urutan adegan. Perubahan sumber audio menandai transkripsi kedaluwarsa. Subtitle dari bagian yang terpotong disimpan dan disembunyikan; dapat dihapus dari daftar subtitle tersembunyi.
- Editor mendukung koreksi teks/waktu, tambah, hapus, pecah, dan gabung. Koreksi teks menghapus timestamp kata baris tersebut sehingga tampil sebagai teks biasa. Subtitle manual tidak memiliki highlight per kata. Subtitle dari sumber yang bertumpuk dipotong pada awal ucapan berikutnya agar hanya satu baris ucapan aktif. Penggabungan subtitle menjadi entri manual pada waktu timeline; periksa ulang setelah mengubah susunan.
- **Generate Ulang** meminta konfirmasi sebelum mengganti koreksi. ID generasi mencegah hasil lama menimpa koreksi ketika proyek dibuka kembali.
- Unduh SRT/VTT dari editor atau hasil render. Teks deskripsi tidak dianggap sebagai transkripsi ucapan.

Konfigurasi opsional: salin `.env.example` menjadi `.env`. `STUDIO_DATA_DIR` mengubah direktori data, dan `WHISPER_MODEL` mengganti model. Model pengganti wajib mendukung timestamp kata dan kompatibel dengan Transformers.js. Unduh ulang model setelah menggantinya. Port default backend 4310 mengikuti proxy Vite; jika mengubah port, ubah juga target proxy di `vite.config.ts`.

**Login Codex tidak digunakan sebagai API aplikasi.** Tidak ada integrasi AI untuk menyusun teks atau memproses arahan bebas. Seluruh fitur manual, template, preview, penyimpanan dan render berfungsi tanpa integrasi AI. Semua konfigurasi rahasia harus berada pada backend `.env`, bukan dalam file frontend atau variabel `VITE_*`. `.env` dan data pengguna dikecualikan dari Git.

## Penyimpanan & render

Default `studio-data/` pada root proyek:

| Lokasi | Isi |
| --- | --- |
| `database.json` | Proyek, referensi media, subtitle, job dan snapshot render |
| `media/` | File asli dengan nama UUID dan ekstensi tervalidasi |
| `thumbs/` | Thumbnail media |
| `models/` | Cache model Whisper lokal |
| `renders/` | MP4, JPG, SRT dan VTT berdasarkan ID job |
| `tmp/` | File upload sementara |

Database ditulis ke file sementara kemudian diganti dengan rename atomik, sehingga proses terputus saat menulis tidak meninggalkan JSON separuh tertulis. Bila database utama rusak, server berhenti dengan pesan yang jelas agar data tidak ditimpa otomatis. Cadangkan seluruh `studio-data/` sebelum memindahkan laptop atau menghapus folder.

Render diserialkan: maksimal satu job berat aktif, dua frame paralel. Klik export berulang untuk proyek yang sama mengembalikan job aktif yang sama. Snapshot metadata dan referensi file dibekukan saat job dibuat, sehingga edit berikutnya tidak memengaruhi hasil lama. Job aktif yang terputus saat restart ditandai **Gagal** dan dapat dicoba kembali. Browser **Chrome Headless Shell** disediakan Remotion, diperiksa sebelum render, dan diunduh jika belum tersedia. Di laptop ini browser sudah berhasil dipakai untuk render.

Menghapus proyek tidak menghapus hasil render atau media asli. Media asli sengaja dipertahankan untuk duplikasi dan snapshot; pembersihan otomatis media yatim belum disediakan. Menghapus hasil render hanya menghapus file hasil job tersebut, bukan proyek edit.

## Struktur kode

- `app/`: aplikasi React dan CSS responsif, Remotion Player.
- `shared/model.ts`: skema Zod, model proyek, timing, validasi, pemetaan subtitle, SRT/VTT.
- `src/StudioVideo.tsx`: komposisi bersama untuk preview dan render. Layout memakai koordinat desain 1080 agar ukuran teks/crop konsisten pada output 720p/1080p.
- `src/HelloWorld.tsx`: video promosi awal yang dipertahankan.
- `server/index.ts`: REST API upload/proyek/render, penyimpanan atomik, antrean render, orchestrator transkripsi.
- `server/whisper.mjs`: proses terpisah untuk model dan transkripsi CPU.
- `tests/`: uji timing, browser desktop/HP, transkripsi dan ketahanan API.

Dependensi tambahan utama: `@remotion/player`, `@remotion/renderer`, `@remotion/bundler`, `@remotion/media`, `@remotion/captions` (semuanya **4.0.540**, sama dengan `remotion`); `express`, `multer`, `dotenv`, `ffmpeg-static`, `ffprobe-static`, `@huggingface/transformers`. Tool pengembangan: Vite 7, plugin React 5, concurrently, tsx, Playwright, serta paket tipe TypeScript.

## Verifikasi

```powershell
npm run lint
npm test
node tests/fixtures.mjs
npm run dev
# Jalankan pada terminal kedua:
npm run test:e2e
npx tsx tests/api.test.ts
```

Uji browser menggunakan Chrome Headless Shell yang telah disediakan Remotion. Jika belum ada, jalankan `npx remotion browser ensure`. Tes transkripsi memerlukan model yang disiapkan lewat antarmuka dan fixture ucapan `tests/fixtures/ucapan.wav`; file ucapan uji ini dibuat dengan synthesizer Windows untuk menguji transkripsi nyata, bukan menggantikan mesin transkripsi. Tes membuat proyek/media/hasil uji lokal. Screenshot dan MP4 pemeriksaan disimpan di `test-results/` (tidak masuk Git).

Aplikasi ini ditujukan untuk satu pengguna lokal. Belum menyediakan autentikasi multiuser, kolaborasi, deployment publik, AI penulis naskah, atau pembersihan media otomatis.

Referensi API: [Remotion Renderer](https://www.remotion.dev/docs/renderer/render-media), [Remotion Player](https://www.remotion.dev/docs/player), [model Whisper bertimestamp](https://huggingface.co/onnx-community/whisper-tiny_timestamped).

## Deskripsi Unit, Perintah Edit AI, dan alternatif

Pada halaman Create Video, bagian utama tersusun sebagai Upload Foto & Video, Deskripsi Unit, Style dan Pengaturan Video, Perintah Edit AI, serta Rencana Edit hasil analisis. Preview berada di kanan pada desktop; pengaturan, preview, dan timeline disusun vertikal pada HP. Tab Teks, Logo & Kontak, Audio, dan Subtitle tetap menyediakan kontrol manual.

- `unitDescription` hanya untuk data faktual properti. `editPrompt` hanya untuk arahan pengeditan. Keduanya masuk autosave dan terbuka kembali secara terpisah. Susun Teks Adegan memakai `unitDescription`, tidak memakai prompt.
- `alternativeCount` menerima 1 atau 3, default **3**. Pilihan ikut tersimpan.
- Teks lama pada `description` dan `direction` tetap utuh. Migrasi hanya menambahkan field kosong; tidak menebak pemisahan isi. Arsip pada Deskripsi Unit menyediakan pilihan teks dan tombol penyalinan ke kolom tujuan, dengan menambahkan teks tanpa menimpa isian yang sudah ada.
- **Analisis Bahan & Perintah** menyimpan input dan mengirim envelope ke backend lokal dengan peran `sumber_fakta_unit` dan `arahan_pengeditan`. Backend menyiapkan batasan fakta, media yang sama, variasi yang mengikuti instruksi eksplisit, perlindungan harga/kontak, dan larangan render otomatis.
- Pemeriksaan lokal hanya membandingkan fakta yang tertulis jelas: harga berlabel Rp, LT/LB, jumlah kamar tidur/mandi, UWTO, dan arah hadap. Perbedaan ditandai sebagai konflik dan tidak diterapkan. Pemeriksaan ini bukan analisis AI dan tidak memeriksa seluruh kemungkinan konflik makna.
- **Integrasi AI pengeditan belum tersedia.** Tidak ada pemanggilan layanan AI, hasil analisis simulasi, kartu alternatif palsu, atau render otomatis. Rencana Edit menampilkan status tersebut. Generasi A/B/C, preview per alternatif, pemilihan, revisi, dan coba lagi per alternatif belum aktif sampai provider AI pengeditan diimplementasikan. Whisper hanya digunakan untuk transkripsi ucapan, bukan pembuatan alternatif.

Implementasi brief: `app/CreationBrief.tsx` dan `shared/edit-brief.ts`. Uji migrasi, autosave dua kolom, jumlah alternatif, konflik, serta susunan desktop/HP tersedia pada `tests/brief.spec.ts` dan `tests/model.test.ts`.
