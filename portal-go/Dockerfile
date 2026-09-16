FROM golang:1.25-bookworm AS build
WORKDIR /build
COPY portal-go/go.mod portal-go/go.sum ./
COPY portal-go/*.go ./
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /portal-go .

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /portal-go /usr/local/bin/portal-go
USER 65534:65534
ENV PORT=8080 AUTH_MODE=http
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/portal-go"]
