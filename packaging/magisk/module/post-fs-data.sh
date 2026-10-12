#!/system/bin/sh
# Dijalankan sangat awal saat boot. Pastikan folder module ada & permission benar.
MODDIR=${0%/*}
[ -z "$MODDIR" ] && MODDIR=/data/adb/modules/kangmanis
chmod 0755 "$MODDIR/bin/launcher" 2>/dev/null
chmod 0755 "$MODDIR/service.sh" 2>/dev/null
