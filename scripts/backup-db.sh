#!/bin/bash
# Kènè — Sauvegarde nocturne SQLite + copie hors serveur (Telegram) + alertes.
# Cron : 0 3 * * * /opt/kene/scripts/backup-db.sh >> /var/log/kene-backup.log 2>&1
set -uo pipefail

APP_DIR=/opt/kene
DB=$APP_DIR/db/custom.db
BACKUP_DIR=$APP_DIR/backups/daily
SNAPSHOT_DIR=$APP_DIR/db/backups
STATUS_FILE=$SNAPSHOT_DIR/.offsite-status.json
mkdir -p "$BACKUP_DIR" "$SNAPSHOT_DIR"

# Variables d'alerte depuis .env (sans exécuter le fichier)
getenv() { grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
TG_TOKEN=$(getenv TELEGRAM_BOT_TOKEN)
TG_CHAT=$(getenv TELEGRAM_CHAT_ID)
CMB_KEY=$(getenv CALLMEBOT_WHATSAPP_APIKEY)
ALERT_PHONE=$(getenv ADMIN_ALERT_PHONE)

NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DATE=$(date +%Y-%m-%d_%H%M)
SNAP_DATE=$(date +%Y-%m-%d-%H%M)
TARGET=$BACKUP_DIR/kene_db_$DATE.db
SNAP_TARGET=$SNAPSHOT_DIR/kene-snapshot-$SNAP_DATE.db

alert() {
  local msg="$1"
  if [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ]; then
    curl -s -m 15 "https://api.telegram.org/bot$TG_TOKEN/sendMessage" \
      --data-urlencode "chat_id=$TG_CHAT" --data-urlencode "text=$msg" >/dev/null || true
  fi
  if [ -n "$CMB_KEY" ] && [ -n "$ALERT_PHONE" ]; then
    local p="$ALERT_PHONE"; [[ "$p" != +* ]] && p="+225$p"
    curl -s -m 15 -G "https://api.callmebot.com/whatsapp.php" \
      --data-urlencode "phone=$p" --data-urlencode "text=$msg" --data-urlencode "apikey=$CMB_KEY" >/dev/null || true
  fi
}

write_status() { # ok target detail
  printf '{"ok":%s,"at":"%s","target":%s,"detail":"%s"}\n' "$1" "$NOW_ISO" "$2" "$3" > "$STATUS_FILE"
}

if [ ! -f "$DB" ]; then
  echo "$NOW_ISO ERREUR: base introuvable $DB"
  alert "🚨 KÈNÈ — Sauvegarde impossible : base introuvable sur le VPS."
  write_status false null "Base introuvable"
  exit 1
fi

if ! sqlite3 "$DB" ".backup \"$TARGET\""; then
  echo "$NOW_ISO ERREUR: sqlite3 .backup a échoué"
  alert "🚨 KÈNÈ — Échec de la sauvegarde nocturne (sqlite3)."
  write_status false null "Échec sqlite3 .backup"
  exit 1
fi
if [ "$(sqlite3 "$TARGET" 'PRAGMA integrity_check;')" != "ok" ]; then
  echo "$NOW_ISO ERREUR: intégrité de la copie KO"
  alert "🚨 KÈNÈ — Copie de sauvegarde corrompue (integrity_check)."
  write_status false null "Copie corrompue"
  exit 1
fi
gzip -f "$TARGET"
cp -f "$TARGET.gz" "$SNAP_TARGET.gz"
SIZE=$(du -h "$TARGET.gz" | cut -f1)
echo "$NOW_ISO Sauvegarde reussie: $TARGET.gz ($SIZE)"
find "$BACKUP_DIR" -name 'kene_db_*.db.gz' -mtime +30 -delete
find "$SNAPSHOT_DIR" -name 'kene-snapshot-*.db.gz' -mtime +30 -delete

# Copie hors serveur : envoi du fichier sur Telegram (limite 50 Mo)
if [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ]; then
  RESP=$(curl -s -m 120 "https://api.telegram.org/bot$TG_TOKEN/sendDocument" \
    -F "chat_id=$TG_CHAT" -F "document=@$TARGET.gz" \
    -F "caption=🗄️ Kènè — sauvegarde du $DATE ($SIZE)")
  if echo "$RESP" | grep -q '"ok":true'; then
    echo "$NOW_ISO Copie externe Telegram OK"
    write_status true '"Telegram"' "$SIZE"
  else
    echo "$NOW_ISO ERREUR copie Telegram: $RESP"
    write_status false '"Telegram"' "Envoi Telegram échoué"
    alert "⚠️ KÈNÈ — Sauvegarde locale OK mais copie externe Telegram échouée."
  fi
else
  write_status false null "Sauvegarde locale OK ($SIZE) — activez Telegram pour l'envoi hors serveur"
fi
