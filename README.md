# KangManis

**Backup & Storage Jaringan Lokal untuk Foto dan Dokumen**

KangManis adalah aplikasi file manager self-hosted yang berjalan di server lokal (Node.js). Dirancang untuk membackup, mengelola, dan membagikan foto serta dokumen melalui jaringan lokal (WiFi/LAN). Akses dari browser perangkat apapun — termasuk Android.

## Fitur

- **Upload File & Folder** — drag & drop atau pilih manual, kompresi gambar otomatis saat upload
- **File Explorer** — navigasi folder, breadcrumbs, urutkan (nama, ukuran, tanggal)
- **Preview Gambar** — pratinjau langsung di browser
- **Kompres Gambar** — kompresi JPEG/PNG/WebP dengan kontrol kualitas
- **Verifikasi Integritas** — hash SHA-256 untuk memastikan file tidak rusak
- **Share Link** — generate link download dengan expiry time
- **Move / Copy / Rename / Delete** — operasi file lengkap
- **Batch Operations** — pilih banyak file sekaligus untuk hapus atau pindah
- **User Management** — multi-user dengan role admin & user
- **Dark & Light Mode** — tema yang dapat ditoggle
- **Auto-Detect IP** — otomatis mendeteksi IP lokal yang aktif
- **Responsive UI** — works di desktop dan mobile

## Tech Stack

| Komponen | Teknologi |
|----------|-----------|
| Backend | Node.js, Express 5 |
| Frontend | HTML + Tailwind CSS (CDN) + Lucide Icons |
| Auth | bcryptjs, express-session |
| Upload | formidable |
| Image Processing | sharp |
| Database | JSON file (users.json, shares.json) |

## Persyaratan

- **Node.js** v18 atau lebih tinggi
- **npm**
- (Opsional) **sharp** untuk fitur kompresi gambar & thumbnail

## Instalasi

```bash
# Clone repository
git clone https://github.com/username/kangmanis.git
cd kangmanis

# Install dependencies
npm install

# Jalankan server
npm start
```

Server akan berjalan di `http://localhost:8080`.

## Konfigurasi

Edit `config.json` untuk mengubah pengaturan:

```json
{
  "appName": "KangManis",
  "port": 8080,
  "maxUploadSize": 500,
  "imageQuality": 80,
  "imageSizes": {
    "thumbnail": 200,
    "preview": 1920
  },
  "baseDir": "/sdcard/Download/KangManis",
  "sessionSecret": "ganti-secret-ini",
  "theme": "dark"
}
```

| Field | Deskripsi | Default |
|-------|-----------|---------|
| `port` | Port server | `8080` |
| `maxUploadSize` | Maksimal ukuran upload (MB) | `500` |
| `imageQuality` | Kualitas kompresi gambar (1-100) | `80` |
| `baseDir` | Lokasi penyimpanan file | `/sdcard/Download/KangManis` |
| `sessionSecret` | Secret key untuk session | wajib diganti |
| `theme` | Tema default (`dark`/`light`) | `dark` |

## Default Login

| Username | Password | Role |
|----------|----------|------|
| `admin` | `admin123` | Admin |

> **Penting:** Segera ganti password default setelah login pertama kali.

## Penggunaan

### Akses Lokal

Buka browser di komputer yang menjalankan server:

```
http://localhost:8080
```

### Akses dari Perangkat Lain (WiFi/LAN)

Server otomatis mendeteksi IP lokal. Lihat IP yang ditampilkan di console saat server启动:

```
🚀 KangManis Server Aktif!
📍 Local:    http://localhost:8080
📍 Network:  http://192.168.1.100:8080
```

Akses dari perangkat lain (HP, tablet, laptop) menggunakan IP Network.

### Akses dari Android (Termux)

```bash
pkg install nodejs
git clone https://github.com/username/kangmanis.git
cd kangmanis
npm install
npm start
```

## Struktur Projek

```
kangmanis/
├── server.js          # Backend Express server
├── index.html         # Frontend SPA (file manager)
├── login.html         # Halaman login
├── config.json        # Konfigurasi aplikasi
├── package.json       # Dependencies & scripts
└── assets/
    ├── tailwind.js    # Tailwind CSS (bundled)
    └── lucide.min.js  # Lucide Icons (bundled)
```

## API Endpoints

| Method | Endpoint | Deskripsi | Auth |
|--------|----------|-----------|------|
| POST | `/api/login` | Login | - |
| GET | `/api/me` | Info user login | Yes |
| GET | `/api/files` | Daftar file/folder | Yes |
| POST | `/api/upload` | Upload file | Yes |
| POST | `/api/mkdir` | Buat folder | Yes |
| POST | `/api/rename` | Rename file/folder | Yes |
| POST | `/api/delete` | Hapus file/folder | Yes |
| POST | `/api/batch-delete` | Hapus banyak | Yes |
| POST | `/api/move` | Pindah file | Yes |
| POST | `/api/copy` | Salin file | Yes |
| POST | `/api/compress` | Kompres gambar | Yes |
| GET | `/api/verify` | Verifikasi hash | Yes |
| GET | `/api/download` | Download file | Yes |
| GET | `/api/preview` | Preview file | Yes |
| POST | `/api/share` | Buat share link | Yes |
| GET | `/api/shares` | Daftar share link | Yes |
| DELETE | `/api/share/:token` | Hapus share | Yes |
| GET | `/api/users` | Daftar user | Admin |
| POST | `/api/users` | Tambah user | Admin |
| DELETE | `/api/users/:id` | Hapus user | Admin |

## Lisensi

MIT License
