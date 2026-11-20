FROM mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27
RUN apt-get update \
    && apt-get install -y --no-install-recommends openbox x11-utils \
    && rm -rf /var/lib/apt/lists/*
COPY --chmod=0555 deploy/observability/browser-entry.sh /usr/local/bin/axon-quality-browser
ENTRYPOINT ["xvfb-run", "-a", "/usr/local/bin/axon-quality-browser"]
