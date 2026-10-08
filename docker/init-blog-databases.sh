#!/bin/sh
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=blog_password="$BLOG_DB_PASSWORD" --set=waline_password="$WALINE_DB_PASSWORD" <<'SQL'
CREATE ROLE kailog LOGIN PASSWORD :'blog_password';
ALTER DATABASE kailog OWNER TO kailog;
CREATE ROLE waline LOGIN PASSWORD :'waline_password';
CREATE DATABASE waline OWNER waline;
SQL
psql -v ON_ERROR_STOP=1 --username waline --dbname waline -f /bootstrap/waline.pgsql
