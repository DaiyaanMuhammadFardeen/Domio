# Domio benchmark service — multi-stage build.
#
# Stage 1: compile a static binary against the root Go module.
# Stage 2: distroless final image with non-root user.

# ---------- Builder ----------
FROM golang:1.25.0-bookworm AS builder

WORKDIR /src

# Module manifest first so dependency layers cache.
COPY go.mod go.sum ./

# Pull deps. Use mod download for reproducible builds.
RUN go mod download

# Copy source.
COPY services/benchmark ./services/benchmark

# Build a static binary.
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w" \
    -o /out/benchmark \
    ./services/benchmark/cmd/benchmark

# ---------- Runtime ----------
FROM gcr.io/distroless/static-debian12:nonroot AS runtime

WORKDIR /app

# Copy the compiled binary.
COPY --from=builder /out/benchmark /app/benchmark

# distroless already runs as nonroot (UID 65532).
USER nonroot

ENV PORT=8095 \
    HOST=0.0.0.0

EXPOSE 8095

# Healthcheck: GET /healthz must return 200.
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["/app/benchmark", "--healthcheck"]

ENTRYPOINT ["/app/benchmark"]
