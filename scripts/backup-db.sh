#!/bin/bash
set -e
BACKUP_DIR=/opt/kene/backups/daily
mkdir -p $BACKUP_DIR
DATE=$(date +%Y-%m-%d_%H%M)
TARGET=$BACKUP_DIR/kene_db_$DATE.db

if [ -f /opt/kene/db/custom.db ]; then
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 /opt/kene/db/custom.db .backup '$TARGET'
    else
        cp /opt/kene/db/custom.db $TARGET
    fi
    gzip -f $TARGET
    echo Sauvegarde reussie: $TARGET.gz
    find $BACKUP_DIR -name kene_db_*.db.gz -mtime +30 -delete
fi
