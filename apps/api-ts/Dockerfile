FROM oven/bun:1.3.8-alpine AS base
WORKDIR /app

# Dependencies
FROM base AS deps
COPY package.json bun.lockb* ./
RUN bun install --frozen-lockfile

# Builder — generate Prisma client
FROM deps AS builder
COPY . .
RUN bunx prisma generate

# Production runner
FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/bunfig.toml ./bunfig.toml
EXPOSE 8001
CMD ["bun", "run", "src/index.ts"]
