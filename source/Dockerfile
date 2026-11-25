# syntax=docker/dockerfile:1
FROM node:24.22.2-bookworm-slim AS build
COPY --chown=node:node . /app
WORKDIR /app
USER node
# Corporate/session CAs are optional BuildKit inputs, never copied into layers.
# TLS verification stays enabled with or without this optional secret.
# Install, verify and prune in one layer: no development dependency/cache layers
# remain in the runtime image, and VFS builders avoid duplicating the rootfs.
RUN --mount=type=secret,id=npm_ca,uid=1000,gid=1000,mode=0400 \
    set -eu; \
    if [ -f /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --include=dev --ignore-scripts --no-audit --no-fund \
    && npm run build:cloudflare \
    && npm run check \
    && npm run lint \
    && npm run typecheck:core \
    && npm run preflight:release \
    && npm run audit:static \
    && node scripts/template-audit.mjs \
    && npm test \
    && npm audit --audit-level=low \
    && npm audit --omit=dev --audit-level=low \
    && npm run licenses:generate \
    && npm prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force \
    && rm -rf .cloudflare-build .wrangler \
    && mkdir -p /app/data /app/public/uploads

FROM build AS production
ENV NODE_ENV=production RATE_LIMIT_BACKEND=memory-single-instance
EXPOSE 3000
VOLUME ["/app/data","/app/public/uploads"]
USER node
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"
CMD ["npm","start"]
