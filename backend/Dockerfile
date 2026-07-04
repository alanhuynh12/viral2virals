# Multi-stage build for the viral2viral NestJS backend.
#
# This runs as a persistent container (Railway, Render, Fly.io, Cloud Run, a
# VM, etc.) rather than a serverless function, because the app relies on:
#   - in-memory session state that must survive across requests
#   - the `ffmpeg` binary for multi-clip video stitching
#   - long-running (multi-minute) batch AI video generation jobs
# all of which are a poor fit for stateless, short-lived serverless functions.

# ---- Build stage ----
FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Runtime stage ----
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# ffmpeg is required for stitching per-scene Veo clips into one video
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/main.js"]
