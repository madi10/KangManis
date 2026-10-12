#!/system/bin/sh
# Dijalankan oleh Magisk pada late_start service (dengan akses root).

MODDIR=${0%/*}
[ -z "$MODDIR" ] && MODDIR=/data/adb/modules/kangmanis
PIDFILE=/data/local/tmp/kangmanis.pid
PORT=$(grep -o '"port"[^,]*' "$MODDIR/app/config.json" 2>/dev/null | grep -o '[0-9]\+')
[ -z "$PORT" ] && PORT=8080

# tunggu boot selesai
i=0
while [ "$(getprop sys.boot_completed)" != "1" ] && [ $i -lt 120 ]; do
  sleep 2
  i=$((i + 1))
done
sleep 8

# hentikan instance lama bila ada
if [ -f "$PIDFILE" ]; then
  OLD=$(cat "$PIDFILE" 2>/dev/null)
  [ -n "$OLD" ] && kill "$OLD" 2>/dev/null
fi

export HOME="$MODDIR"
export TMPDIR=/data/local/tmp
export PATH=/system/bin:/system/xbin
export LD_LIBRARY_PATH="$MODDIR/bin"
export NODE_ENV=production

cd "$MODDIR/app" || exit 1

nohup "$MODDIR/bin/launcher" "$MODDIR/app/server.js" >> "$MODDIR/kangmanis.log" 2>&1 &
echo $! > "$PIDFILE"
