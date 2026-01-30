# AssureBot - Standalone Docker Image
# Lean, secure, self-hosted AI assistant for Railway
#
# Build from repo root: docker build -f secure/Dockerfile .
# Or set Railway root directory to: secure/

FROM node:22-slim AS builder

WORKDIR /app

# Copy package files (handles both root and secure/ as context)
COPY package*.json ./
COPY tsconfig.json* ./
COPY *.ts ./
COPY *.d.ts ./

# Install dependencies
RUN npm install --omit=dev=false

# Build TypeScript
RUN npm run build

# Production image
FROM node:22-slim AS runner

# Security: Run as non-root user (use different UID since 1000 exists)
RUN useradd -m -u 1001 -s /bin/bash assurebot

WORKDIR /app

# Copy built files and production deps
COPY --from=builder --chown=assurebot:assurebot /app/node_modules ./node_modules
COPY --from=builder --chown=assurebot:assurebot /app/dist ./dist
COPY --from=builder --chown=assurebot:assurebot /app/package.json ./

# Create data directory for audit logs (before switching user)
RUN mkdir -p /app/data && chown assurebot:assurebot /app/data

USER assurebot

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:8080/health').then(r => process.exit(r.ok ? 0 : 1))" || exit 1

CMD ["node", "dist/index.js"]
