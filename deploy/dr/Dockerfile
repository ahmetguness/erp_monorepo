FROM postgres:17-bookworm
ARG PGBACKREST_VERSION=2.60.1-1.pgdg12+1
RUN apt-get update \
 && apt-get install -y --no-install-recommends pgbackrest=${PGBACKREST_VERSION} util-linux \
 && rm -rf /var/lib/apt/lists/* \
 && install -d -o postgres -g postgres -m 0700 /var/lib/pgbackrest /var/log/pgbackrest /var/spool/pgbackrest
COPY --chmod=755 deploy/dr/configure.sh /usr/local/bin/dr-configure
COPY --chmod=755 deploy/dr/backup-loop.sh /usr/local/bin/dr-backup-loop
ENV PGBACKREST_CONFIG=/tmp/pgbackrest.conf
ENTRYPOINT ["dr-configure"]
CMD ["docker-entrypoint.sh", "postgres"]
