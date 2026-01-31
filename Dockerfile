FROM oven/bun:1.1.38

WORKDIR /app

COPY package.json bun.lockb* tsconfig.json ./

ENV NODE_ENV=production
RUN bun install --frozen-lockfile --production

COPY src ./src
COPY scripts ./scripts
ENV PORT=3000

EXPOSE 3000

CMD ["bun", "src/index.ts"]
