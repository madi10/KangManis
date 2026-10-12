#!/system/bin/sh
# Dijalankan oleh Magisk saat instalasi module.

ui_print "*******************************"
ui_print "  KangManis Storage Server"
ui_print "*******************************"

if [ ! -d "$MODPATH/bin" ] || [ ! -f "$MODPATH/bin/launcher" ]; then
  abort "! Module rusak: bin/launcher tidak ditemukan"
fi

DEVICE_ABI="$(getprop ro.product.cpu.abi)"
MODULE_ABI="$(cat "$MODPATH/abi" 2>/dev/null)"
[ -z "$MODULE_ABI" ] && MODULE_ABI="arm64-v8a"

ui_print "- ABI perangkat: $DEVICE_ABI"
ui_print "- ABI module  : $MODULE_ABI"

case "$DEVICE_ABI" in
  arm64-v8a)
    case "$MODULE_ABI" in
      arm64-v8a|armeabi-v7a) ;;
      *) abort "! ABI module ($MODULE_ABI) tidak kompatibel dengan perangkat ($DEVICE_ABI)" ;;
    esac
    ;;
  armeabi-v7a|armeabi)
    [ "$MODULE_ABI" = "armeabi-v7a" ] || abort "! ABI module ($MODULE_ABI) tidak kompatibel dengan perangkat ($DEVICE_ABI)"
    ;;
  x86_64|x86)
    [ "$MODULE_ABI" = "x86_64" ] || abort "! ABI module ($MODULE_ABI) tidak kompatibel dengan perangkat ($DEVICE_ABI)"
    ;;
  *)
    ui_print "- Peringatan: ABI perangkat tidak dikenal, melanjutkan."
    ;;
esac

set_perm_recursive "$MODPATH" 0 0 0755 0644
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/post-fs-data.sh" 0 0 0755
set_perm "$MODPATH/uninstall.sh" 0 0 0755
set_perm "$MODPATH/customize.sh" 0 0 0755
set_perm_recursive "$MODPATH/bin" 0 0 0755 0755
set_perm "$MODPATH/bin/launcher" 0 0 0755

ui_print "- Selesai. Reboot untuk mengaktifkan server."
