unit: ci-runner
owner: dev-platform@example.com
stride:
  S:
    score: 6
    notes:
      - Workflows reference OIDC tokens issued by the GitHub provider;
        no long-lived secrets in CI.
      - SLSA L3 attestation is required for any image that ships.
  T:
    score: 4
    notes:
      - Build provenance is signed by the runner; consumers verify
        before accepting an image.
  R:
    score: 4
    notes:
      - Every workflow run logs the resolved commit SHA, the runner ID,
        and the invocation ID.
  I:
    score: 6
    notes:
      - Default `GITHUB_TOKEN` permissions are minimum necessary;
        workflows must opt into elevated scopes.
  D:
    score: 6
    notes:
      - Workflow concurrency groups prevent redundant runs from
        blocking a release.
  E:
    score: 4
    notes:
      - Secrets are only available in workflows that explicitly pass
        them via `secrets:` block.
