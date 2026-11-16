# CampusOne API (NestJS + Prisma on PostgreSQL)
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# Generate the PostgreSQL Prisma client, then compile TypeScript to dist/.
RUN npm run pg:generate && npm run build

ENV NODE_ENV=production PORT=4000
EXPOSE 4000
# Bring the database schema up to date, then start. Load demo data once with:
#   docker compose run --rm api npm run db:seed
CMD ["sh", "-c", "npm run pg:push && node dist/main.js"]
