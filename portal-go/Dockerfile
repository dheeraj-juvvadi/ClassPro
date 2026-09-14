FROM golang:1.25-bookworm AS build
WORKDIR /build
COPY portal-go/go.mod ./
COPY portal-go/*.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /portal-go .

FROM node:22-bookworm-slim
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY portal-go/package.json portal-go/package-lock.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium && npm cache clean --force
COPY portal-app/src/portal.js portal-app/src/parsers.js portal-app/src/login-diagnostics.js ./portal-app/src/
COPY portal-go/worker.mjs portal-go/start.mjs ./portal-go/
COPY --from=build /portal-go /usr/local/bin/portal-go
RUN mkdir -p /home/node/.cache && chown -R node:node /home/node /ms-playwright
USER node
ENV PORT=8080 WORKER_URL=http://127.0.0.1:3101
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=3s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "portal-go/start.mjs"]
