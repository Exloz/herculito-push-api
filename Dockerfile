FROM oven/bun:1.1.38-alpine

WORKDIR /app

# Create data directory with correct permissions before user switch
RUN addgroup -g 1001 -S bunuser && \
    adduser -S -D -H -u 1001 -h /app -s /sbin/nologin -G bunuser -g bunuser bunuser && \
    mkdir -p /data && \
    chown -R bunuser:bunuser /data

COPY package.json bun.lock tsconfig.json ./

ENV NODE_ENV=production
RUN bun install --frozen-lockfile --production --no-cache && \
    chown -R bunuser:bunuser /app

COPY src ./src
RUN chown -R bunuser:bunuser /app

# Volume for SQLite database
VOLUME ["/data"]

ENV PORT=3000
ENV DATABASE_PATH=/data/push.sqlite

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

USER bunuser

CMD ["bun", "src/app/server.ts"]
