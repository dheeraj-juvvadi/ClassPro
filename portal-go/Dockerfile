FROM golang:1.25-bookworm AS build
WORKDIR /build
COPY portal-go/go.mod portal-go/go.sum ./
COPY portal-go/*.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /portal-go .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates python3 python3-venv libgomp1 libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY portal-python/requirements.txt /app/portal-python/requirements.txt
RUN python3 -m venv /opt/ratio && /opt/ratio/bin/pip install --no-cache-dir -r /app/portal-python/requirements.txt
COPY portal-python /app/portal-python
COPY --from=build /portal-go /usr/local/bin/portal-go
USER 65534:65534
ENV PORT=8080 AUTH_MODE=http PORTAL_CLIENT=ratio-python OCR_ASSET_DIR=/app/portal-python/model PYTHONDONTWRITEBYTECODE=1
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/portal-go"]
