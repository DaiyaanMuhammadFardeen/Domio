/**
 * Analytics-warehouse — GraphQL schema (Phase 17 W2).
 *
 * The schema mirrors contracts/graphql/v1/analytics.graphql so the
 * dashboard (apps/dashboard) can use persisted queries. We define it
 * programmatically rather than reading the SDL file so the warehouse
 * has no runtime dependency on the contracts directory.
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

  type Query {
    deckSummary(workspaceId: String!, fromMs: Float!, toMs: Float!, deckId: String): [DeckSummary!]!
    slideBreakdown(workspaceId: String!, deckId: String!, fromMs: Float!, toMs: Float!): [SlideBreakdown!]!
    funnel(workspaceId: String!, deckId: String!, steps: [String!]!, fromMs: Float!, toMs: Float!): [FunnelStep!]!
    heatmap(workspaceId: String!, deckId: String!, slideId: String!, fromMs: Float!, toMs: Float!): HeatmapTile!
  }
`;
