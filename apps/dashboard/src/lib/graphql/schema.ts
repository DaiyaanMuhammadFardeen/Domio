/**
 * Dashboard GraphQL schema (Phase 17 final).
 *
 * We re-declare the warehouse SDL locally so the gateway can be built
 * and type-checked in isolation (the warehouse runs as a separate
 * service). The shape is intentionally identical — the contracts
 * directory (`contracts/graphql/v1/analytics.graphql`) is the single
 * source of truth and any drift between the two will surface as a
 * type error in the dashboard's persisted-query tests.
 *
 * Then we extend the schema with two local resolvers that proxy:
 *
 *   - `liveSession(sessionId)` → polls live-analytics REST pulse
 *   - `abTestResults(workspaceId, experimentId)` → polls ab-measurement
 *
 * This lets client components query *both* warehouse data and live A/B
 * state via a single GraphQL endpoint.
 */

export const analyticsTypeDefs = /* GraphQL */ `
  type DeckSummary {
    workspaceId: String!
    deckId: String!
    sessionCount: Int!
    viewerCount: Int!
    totalEvents: Int!
    avgSessionMs: Float!
    completionRate: Float!
  }

  type SlideBreakdown {
    workspaceId: String!
    deckId: String!
    slideId: String!
    views: Int!
    uniqueViewers: Int!
    avgDwellMs: Float!
    bounceRate: Float!
  }

  type FunnelStep {
    workspaceId: String!
    deckId: String!
    stepName: String!
    entered: Int!
    completed: Int!
    completionRate: Float!
  }

  type HeatmapCell {
    slideId: String!
    x: Int!
    y: Int!
    intensity: Float!
  }

  type HeatmapTile {
    workspaceId: String!
    deckId: String!
    slideId: String!
    gridCols: Int!
    gridRows: Int!
    cells: [HeatmapCell!]!
  }

  type LiveSession {
    sessionId: String!
    concurrentViewers: Int!
    currentSlide: String
    recentReactions: [String!]!
    lastEventMs: Float!
  }

  type ABVariantResult {
    variantId: String!
    variantKey: String!
    exposures: Int!
    conversions: Int!
    rate: Float!
  }

  type ABTestResults {
    experimentId: String!
    workspaceId: String!
    status: String!
    variants: [ABVariantResult!]!
    lift: Float!
    pValue: Float!
    ciLow: Float!
    ciHigh: Float!
  }

  type Query {
    deckSummary(workspaceId: String!, fromMs: Float!, toMs: Float!, deckId: String): [DeckSummary!]!
    slideBreakdown(
      workspaceId: String!
      deckId: String!
      fromMs: Float!
      toMs: Float!
    ): [SlideBreakdown!]!
    funnel(
      workspaceId: String!
      deckId: String!
      steps: [String!]!
      fromMs: Float!
      toMs: Float!
    ): [FunnelStep!]!
    heatmap(
      workspaceId: String!
      deckId: String!
      slideId: String!
      fromMs: Float!
      toMs: Float!
    ): HeatmapTile!
    liveSession(sessionId: String!): LiveSession!
    abTestResults(workspaceId: String!, experimentId: String!): ABTestResults!
  }
`;
