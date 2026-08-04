ARG NODE_VERSION=22

# Debian rather than Alpine: bun publishes no aarch64 musl binary, so
# `npm install -g bun` fails on arm64 Alpine with
# "Failed to find package @oven/bun-linux-aarch64".
FROM node:${NODE_VERSION}-slim AS base

RUN npm install -g bun@1.2.21

WORKDIR /app

FROM base AS build

COPY package.json bun.lock* ./

RUN bun install --frozen-lockfile

COPY . .

RUN bun run build

FROM node:${NODE_VERSION}-slim AS final

ENV NODE_ENV=production
ENV PORT=243

WORKDIR /app

USER node

# node_modules comes from the build stage rather than a --production install:
# next.config.ts imports @serwist/turbopack, a devDependency, and `next start`
# loads that config at boot. A production-only tree fails with
# MODULE_NOT_FOUND before serving a single request.
COPY --chown=node:node package.json ./
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/public ./public

EXPOSE 243

CMD ["node_modules/.bin/next", "start", "-p", "243"]
