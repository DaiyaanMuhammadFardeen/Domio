unit: minio
owner: data-platform@example.com
stride:
S:
score: 4
notes: - Buckets are only accessible via Vault-issued STS tokens;
permanent access keys are forbidden.
T:
score: 6
notes: - Object metadata includes the SHA-256 of the body, verified on
every read. - Bucket versioning is enabled with lifecycle rules.
R:
score: 6
notes: - Object events stream to NATS, with retention audit logs.
I:
score: 6
notes: - Server-side encryption is mandatory on every bucket. - Buckets are private by default; the few public buckets are
listed in `infra/minio/buckets.public.yaml` and reviewed
quarterly.
D:
score: 4
notes: - Per-prefix rate limit on `S3:PutObject` to avoid noisy-neighbor
writes.
E:
score: 4
notes: - Bucket policies only grant `s3:GetObject` and only to specific
service-account IAM roles.
