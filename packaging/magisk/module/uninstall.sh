#!/system/bin/sh
# Dijalankan oleh Magisk saat module dihapus.
PIDFILE=/data/local/tmp/kangmanis.pid
if [ -f "$PIDFILE" ]; then
  PID=$(cat "$PIDFILE" 2>/dev/null)
  [ -n "$PID" ] && kill "$PID" 2>/dev/null
  rm -f "$PIDFILE"
fi
