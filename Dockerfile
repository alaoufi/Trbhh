# syntax=docker/dockerfile:1

# ---- deps ----
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# openssl is required for Prisma to detect the correct engine (debian-openssl-3.0.x)
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile || pnpm install

# ---- builder ----
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm prisma generate
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---- runner ----
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# openssl for Prisma; fonts-kacst provides Arabic glyphs for the image watermark
# openssl for Prisma; fonts-kacst for Arabic watermark glyphs;
# default-mysql-client provides mysqldump/mysql for DB backup & restore.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates fonts-kacst fontconfig default-mysql-client tzdata \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs
# كل الأوقات والتواريخ المعروضة بتوقيت الرياض (+3)
ENV TZ=Asia/Riyadh

# Standalone output already bundles the traced node_modules (including the
# Prisma client + native query engine), so we only copy public/ and static/.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# schema kept for reference / optional CLI use
COPY --from=builder /app/prisma ./prisma
# Kept in the runtime image for the idempotent, admin-only dynamic-ads lab bootstrap.
COPY --from=builder /app/database ./database

# Writable, persistent upload dir owned by the runtime user. A named volume
# mounted here inherits this ownership, so uploads (ad/classified/promo images)
# can be written even though the app runs as the non-root `nextjs` user.
RUN mkdir -p /app/storage/uploads && chown -R nextjs:nodejs /app/storage

USER nextjs
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "server.js"]
