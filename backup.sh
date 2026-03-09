#!/bin/bash
# Not The Green Owl Backup Script
# Backs up database and .env to Cloudflare R2 via rclone

set -eo pipefail

# Configuration
SOURCE_DIR="$HOME/projects/not-the-green-owl"
REMOTE="r2:not-the-green-owl-backups"
DATETIME=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_DIR="$REMOTE/$DATETIME"

# Copy .env file
if [ -f "$SOURCE_DIR/.env" ]; then
    rclone copy "$SOURCE_DIR/.env" "$BACKUP_DIR/"
    echo "Backed up: .env file"
else
    echo "Info: No .env file found (expected in production — secrets are in system env vars)"
fi

# PostgreSQL backup
if command -v pg_dump &> /dev/null; then
    if [ -z "${PGPASSWORD:-}" ]; then
        echo "Warning: PGPASSWORD is not set — skipping PostgreSQL backup"
    else
        export PGPASSWORD
        pg_dump -h "${PGHOST:-localhost}" -U "${PGUSER:-owl_app}" "${PGDATABASE:-not_the_green_owl}" | gzip > /tmp/pg_backup_$DATETIME.sql.gz
        rclone copy /tmp/pg_backup_$DATETIME.sql.gz "$BACKUP_DIR/"
        rm /tmp/pg_backup_$DATETIME.sql.gz
        echo "Backed up: PostgreSQL dump"
    fi
else
    echo "Warning: pg_dump not found — skipping PostgreSQL backup"
fi

echo "Backup completed: $BACKUP_DIR at $(date)"

# Optional: Remove backups older than 30 days
rclone delete "$REMOTE" --min-age 30d
rclone rmdirs "$REMOTE" --leave-root

echo "Cleanup: Removed backups older than 30 days"
