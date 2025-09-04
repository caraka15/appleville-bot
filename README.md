# 🤖 AppleVille Smart Bot

Bot Node.js yang dirancang ulang dengan arsitektur modern untuk otomatisasi **tanam, booster, dan panen** di AppleVille. Bot ini beroperasi dengan presisi tinggi, mengelola setiap slot secara independen dan paralel, serta dilengkapi dengan notifikasi Telegram cerdas.

## ✨ Fitur Unggulan

- **Manajemen Timer Paralel**: Setiap slot tanaman dan booster memiliki _timer_ presisinya sendiri yang berjalan secara independen, memastikan aksi dieksekusi tepat waktu.

- **Notifikasi Telegram Cerdas**:

  - Memberi tahu Anda saat **CAPTCHA dibutuhkan**, lengkap dengan identitas akun.

  - Bot akan **dijeda secara otomatis** dan mencoba kembali setiap 2 menit.

  - Memberi tahu Anda saat **CAPTCHA berhasil diselesaikan** dan bot berjalan kembali.

  - Memberi tahu Anda saat **AP sudah cukup** untuk upgrade ke level _prestige_ berikutnya.

- **Antarmuka Informatif**:

  - Menampilkan status awal semua slot, saldo, dan target _prestige_ berikutnya saat bot dimulai.

  - Daftar bibit dan booster **disaring secara otomatis** sesuai level _prestige_ Anda.

- **Logika Andal & Anti-Crash**:

  - Dilengkapi sistem "kunci" untuk mencegah _race condition_ saat membeli item.

  - Semua aksi dibungkus `try...catch` dengan mekanisme coba lagi, memastikan bot **tidak akan berhenti** karena error API.

- **Nol Dependensi Eksternal**: Dijalankan murni dengan Node.js bawaan. Tidak perlu `npm install`.

## 🔧 Prasyarat

- **Node.js v18+** (disarankan v20 atau yang lebih baru).

- **Git** (untuk metode instalasi yang disarankan).

## 📦 Instalasi & Setup

Ini adalah cara termudah dan tercepat untuk memulai.

1. **Clone Repositori**: Buka terminal Anda dan jalankan perintah berikut.

   ```
   git clone https://github.com/caraka15/appleville-bot.git
   ```

2. **Masuk ke Folder**:

   ```
   cd appleville-bot
   ```

Selesai! Proyek sudah siap dijalankan.

## 🔑 Setup Awal (Hanya Sekali Jalan)

Saat Anda menjalankan bot untuk pertama kali, ia akan memandu Anda melalui setup interaktif:

1. **Setup Cookie**: Bot akan meminta Anda untuk memasukkan _cookie_ dan menyimpannya di `akun.txt`.

2. **Setup Telegram**: Bot akan bertanya apakah Anda ingin mengatur notifikasi. Jika ya, ia akan meminta Token Bot dan Chat ID Anda, lalu menyimpannya di `telegram-config.js`. Jika tidak, file akan tetap dibuat dengan status nonaktif.

File `akun.txt` dan `telegram-config.js` akan **diabaikan oleh Git** secara otomatis, sehingga konfigurasi pribadi Anda aman.

## ▶️ Menjalankan Bot

Pastikan Anda berada di direktori utama proyek di terminal Anda, lalu jalankan:

```
node main.js
```

Bot akan menampilkan status awal akun Anda, lalu memandu Anda melalui beberapa pertanyaan konfigurasi untuk sesi _farming_ saat ini.

## 🎛️ Konfigurasi

- **Pengaturan Bot**: Semua pengaturan utama (bibit default, jumlah pembelian, dll.) dapat diubah di `config.js`.

- **Notifikasi Telegram**: Anda bisa mengaktifkan/menonaktifkan notifikasi atau mengubah token/ID chat langsung di file `telegram-config.js`.

## ⚠️ Disclaimer

Ini adalah proyek tidak resmi dan tidak berafiliasi dengan AppleVille. Gunakan dengan bijak dan segala risiko ditanggung oleh pengguna.
