#!/bin/sh
set -eu
umask 077
# Secrets are read from files, never command arguments or diagnostic output.
key_file=${DR_CIPHER_FILE:-/run/secrets/dr_cipher}
test -s "$key_file" || { echo 'DR encryption key unavailable' >&2; exit 20; }
key=$(cat "$key_file")
test "${#key}" -ge 32 || { echo 'DR encryption key invalid' >&2; exit 20; }
case "$key" in *[!a-zA-Z0-9+/=_-]*) echo 'DR key encoding invalid' >&2; exit 20;; esac
config=/tmp/pgbackrest.conf
config_tmp=$(mktemp /tmp/pgbackrest.conf.XXXXXX)
trap 'rm -f -- "$config_tmp"' EXIT
{
  printf '[global]\nrepo1-path=/var/lib/pgbackrest\nrepo1-cipher-type=aes-256-cbc\nrepo1-cipher-pass=%s\n' "$key"
  printf 'repo1-retention-full=7\nrepo1-retention-diff=7\nstart-fast=y\nprocess-max=2\narchive-timeout=60\nio-timeout=60\nprotocol-timeout=1800\ndb-timeout=180\n'
  printf 'log-level-console=warn\nlog-level-file=off\nlock-path=/tmp/pgbackrest\nspool-path=/var/spool/pgbackrest\n'
  printf '[erp]\npg1-path=/var/lib/postgresql/data\npg1-socket-path=/var/run/postgresql\n'
} > "$config_tmp"
if [ "$(id -u)" = 0 ]; then chown postgres:postgres "$config_tmp"; fi
mv -f -- "$config_tmp" "$config"
export PGBACKREST_CONFIG="$config"
unset key
exec "$@"
