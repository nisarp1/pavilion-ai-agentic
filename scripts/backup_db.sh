#!/bin/bash
set -e
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="/tmp/pavilion_db_${TIMESTAMP}.sql.gz"
S3_BUCKET="pavilion-media-009846"
S3_PREFIX="db-backups"
echo "[$(date)] Starting DB backup..."
docker exec pavilion-postgres-dev pg_dump -U pavilion_user -d pavilion_agentic_local --no-owner --no-acl | gzip > "$BACKUP_FILE"
aws s3 cp "$BACKUP_FILE" "s3://${S3_BUCKET}/${S3_PREFIX}/$(basename $BACKUP_FILE)" --region us-east-1
rm -f "$BACKUP_FILE"
aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" | awk '{print $4}' | sort | head -n -30 | xargs -I{} aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/{}" --region us-east-1 2>/dev/null || true
echo "[$(date)] Backup complete."
