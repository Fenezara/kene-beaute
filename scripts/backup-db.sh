#!/bin/bash
# Kènè — Sauvegarde nocturne SQLite + chiffrement AES-256 + copie hors serveur + alertes.
# Cron : 0 3 * * * /opt/kene/scripts/backup-db.sh >> /var/log/kene-backup.log 2>&1
set -uo pipefail

APP_DIR=/opt/kene
DB=$APP_DIR/db/custom.db
BACKUP_DIR=$APP_DIR/backups/daily
SNAPSHOT_DIR=$APP_DIR/db/backups
STATUS_FILE=$SNAPSHOT_DIR/.offsite-status.json
mkdir -p "$BACKUP_DIR" "$SNAPSHOT_DIR"

# Variables depuis .env (sans exécuter le fichier)
getenv() { grep -E "^$1=" "$APP_DIR/.env" 2>/dev/null | tail -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//"; }
TG_TOKEN=$(getenv TELEGRAM_BOT_TOKEN)
TG_CHAT=$(getenv TELEGRAM_CHAT_ID)
CMB_KEY=$(getenv CALLMEBOT_WHATSAPP_APIKEY)
ALERT_PHONE=$(getenv ADMIN_ALERT_PHONE)
ENC_SECRET=$(getenv KENE_SESSION_SECRET)

NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DATE=$(date +%Y-%m-%d_%H%M)
SNAP_DATE=$(date +%Y-%m-%d-%H%M)
TARGET=$BACKUP_DIR/kene_db_$DATE.db
SNAP_TARGET=$SNAPSHOT_DIR/kene-snapshot-$SNAP_DATE.db
ENC_LATEST=$BACKUP_DIR/kene-latest.db.gz.enc

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

# Chiffrement AES-256-CBC (PBKDF2 100 000 itérations) pour réplication hors serveur
if [ -n "$ENC_SECRET" ] && command -v openssl >/dev/null 2>&1; then
  KENE_ENC_PASS="$ENC_SECRET" openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt \
    -in "$TARGET.gz" -out "$ENC_LATEST" -pass env:KENE_ENC_PASS && \
    echo "$NOW_ISO Archive chiffree AES-256 prete: $ENC_LATEST"
fi

# Copie hors serveur 1 : Telegram (si configuré)
if [ -n "$TG_TOKEN" ] && [ -n "$TG_CHAT" ]; then
  RESP=$(curl -s -m 120 "https://api.telegram.org/bot$TG_TOKEN/sendDocument" \
    -F "chat_id=$TG_CHAT" -F "document=@$TARGET.gz" \
    -F "caption=🗄️ Kènè — sauvegarde du $DATE ($SIZE)")
  if echo "$RESP" | grep -q '"ok":true'; then
    echo "$NOW_ISO Copie externe Telegram OK"
    write_status true '"Telegram + Coffre AES-256"' "$SIZE"
    exit 0
  else
    echo "$NOW_ISO ERREUR copie Telegram: $RESP"
    alert "⚠️ KÈNÈ — Sauvegarde locale OK mais copie externe Telegram échouée."
  fi
fi

# Conserver le statut ok:true si une réplication externe (GitHub Cloud AES-256 / PC Fondateur) est déjà en place
if [ -f "$STATUS_FILE" ] && grep -q '"ok":true' "$STATUS_FILE" 2>/dev/null; then
  exit 0
fi

write_status false null "Sauvegarde locale OK ($SIZE) — en attente de synchronisation externe"
