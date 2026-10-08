#!/bin/sh
set -eu
umask 077
ROOT=${BLOG_DEPLOY_ROOT:-/opt/services/personal-blog}
BACKUPS=${BLOG_BACKUP_ROOT:-/opt/backups/personal-blog}
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUPS"
TARGET="$BACKUPS/$STAMP"
mkdir "$TARGET"
compose() { docker compose --env-file "$ROOT/.env" -f "$ROOT/docker/compose.host.yml" "$@"; }
compose exec -T postgres pg_dump -U postgres -d kailog -Fc > "$TARGET/blog.dump"
compose exec -T postgres pg_dump -U postgres -d waline -Fc > "$TARGET/waline.dump"
tar -C "$ROOT" -czf "$TARGET/config-media.tar.gz" .env docker/compose.host.yml docker/Caddyfile.http media deployment-version.txt
if [ -f "$ROOT/blog.caddyfragment" ]; then cp "$ROOT/blog.caddyfragment" "$TARGET/blog.caddyfragment"; fi
compose exec -T postgres pg_restore --list < "$TARGET/blog.dump" > "$TARGET/blog-manifest.txt"
compose exec -T postgres pg_restore --list < "$TARGET/waline.dump" > "$TARGET/waline-manifest.txt"
printf '%s\n' "$TARGET" > "$BACKUPS/latest"
find "$BACKUPS" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +6 -exec rm -rf -- {} +
printf 'Backup complete: %s\n' "$TARGET"
