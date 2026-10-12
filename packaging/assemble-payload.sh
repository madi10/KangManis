#!/usr/bin/env bash
# Merakit payload aplikasi KangManis (server + frontend + deps) tanpa sharp.
# Dipakai oleh CI untuk paket APK (TARGET=android) dan Magisk (TARGET=magisk).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="${TARGET:-test}"
OUT="${OUT:-$ROOT/packaging/build/payload}"

echo "== Merakit payload (TARGET=$TARGET) -> $OUT =="

rm -rf "$OUT"
mkdir -p "$OUT"

cp "$ROOT/server.js" "$OUT/server.js"
cp "$ROOT/index.html" "$OUT/index.html"
cp "$ROOT/login.html" "$OUT/login.html"
cp -r "$ROOT/assets" "$OUT/assets"

# package.json runtime (tanpa sharp)
cp "$ROOT/packaging/payload/package.json" "$OUT/package.json"

# config default per target
case "$TARGET" in
  android)
    BASEDIR='"/sdcard/Android/data/com.kangmanis.app/files/KangManis"'
    ;;
  magisk)
    BASEDIR='"/sdcard/Download/KangManis"'
    ;;
  *)
    BASEDIR='"/tmp/KangManis"'
    ;;
esac

cat > "$OUT/config.json" <<EOF
{
  "appName": "KangManis",
  "port": 8080,
  "maxUploadSize": 500,
  "imageQuality": 80,
  "imageSizes": {
    "thumbnail": 200,
    "preview": 1920
  },
  "baseDir": $BASEDIR,
  "sessionSecret": "kangmanis-android-secret-change-me",
  "theme": "dark",
  "telegramBotToken": "",
  "telegramChatId": ""
}
EOF

# dependency portabel
cd "$OUT"
npm install --omit=dev --no-audit --no-fund

# pastikan native module tidak ikut
rm -rf node_modules/sharp node_modules/@img

# hapus symlink .bin agar aman dipaketkan ke assets APK
find node_modules -type d -name '.bin' -prune -exec rm -rf {} + 2>/dev/null || true

echo "== Payload siap: $OUT =="
