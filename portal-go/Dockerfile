FROM golang:1.25-bookworm AS build
WORKDIR /build
COPY portal-go/go.mod portal-go/go.sum ./
COPY portal-go/*.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /portal-go .

FROM debian:bookworm-slim AS browser
ARG CHROME_VERSION=152.0.7977.82
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl unzip && rm -rf /var/lib/apt/lists/*
RUN curl --fail --location --retry 3 "https://storage.googleapis.com/chrome-for-testing-public/${CHROME_VERSION}/linux64/chrome-linux64.zip" -o /tmp/chrome.zip \
    && unzip -q /tmp/chrome.zip -d /opt && rm /tmp/chrome.zip

FROM node:22-bookworm-slim
ENV NODE_ENV=production PORTAL_BROWSER_PATH=/opt/chrome-linux64/chrome
WORKDIR /app
COPY portal-go/package.json portal-go/package-lock.json ./
RUN npm ci --omit=dev && npx playwright install-deps chromium && apt-get install -y --no-install-recommends ca-certificates && update-ca-certificates && npm cache clean --force && rm -rf /var/lib/apt/lists/*
COPY --from=browser /opt/chrome-linux64 /opt/chrome-linux64
COPY portal-app/src/portal.js portal-app/src/parsers.js portal-app/src/login-diagnostics.js portal-app/src/submission-transport.js portal-app/src/fast-submission.js ./portal-app/src/
COPY portal-app/src/portal-response.js portal-app/src/portal-console.js ./portal-app/src/
COPY portal-app/src/credential-integrity.js ./portal-app/src/
COPY portal-go/worker.mjs portal-go/start.mjs ./portal-go/
COPY --from=build /portal-go /usr/local/bin/portal-go
RUN mkdir -p /home/node/.cache && chown -R node:node /home/node
USER node
ENV PORT=8080 WORKER_URL=http://127.0.0.1:3101 PORTAL_SUBMISSION_TRANSPORT=fasthttp
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=3s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "portal-go/start.mjs"]
