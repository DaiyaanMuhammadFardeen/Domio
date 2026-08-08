# ClickHouse loader Dockerfile — Go multi-stage build.
#
# Stage 1: build the loader binary against the workspace go.mod.
# Stage 2: scratch-style distroless image with just the loader and
# CA certs.

# ---------- Builder ----------
FROM golang:1.25.0-bookworm AS builder

WORKDIR /src

# Copy module files first so dependency downloads are cached.
COPY go.mod go.sum ./
RUN go mod download

# Copy the rest of the source.
COPY services/clickhouse-loader ./services/clickhouse-loader

# Build a static binary. CGO_ENABLED=0 because the runtime image has
# no glibc.
ENV CGO_ENABLED=0
RUN go build -trimpath -ldflags="-s -w" \
    -o /out/clickhouse-loader \
    ./services/clickhouse-loader/cmd/loader

# ---------- Runtime ----------
FROM gcr.io/distroless/static-debian12:nonroot

WORKDIR /app
COPY --from=builder /out/clickhouse-loader /app/clickhouse-loader

USER nonroot:nonroot
EXPOSE 8080

ENTRYPOINT ["/app/clickhouse-loader"]
