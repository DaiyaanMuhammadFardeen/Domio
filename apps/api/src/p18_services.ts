/**
 * Phase 18 services factory.
 *
 * Creates one instance of each P18 service backed by in-memory stores.
 * Used by the API server at startup — real Postgres stores replace these
 * in production (env-driven DATABASE_URL check lives inside each service).
 */

import { CollabService, InMemoryCollabStore } from '@domio/collab-service';
import {
  PermissionService,
  InMemoryPermissionGrantStore,
  InMemoryWorkspaceMemberStore,
  InMemoryGroupMembershipStore,
  InMemoryResourceHierarchyStore,
} from '@domio/permission-engine';
import { SuggestionsService, InMemorySuggestionsStore } from '@domio/suggestions-service';
import { MergeRequestService, InMemoryMergeRequestStore } from '@domio/merge-request-service';
import { LibraryService, InMemoryLibraryStore } from '@domio/library-service';
import { ExpiryService, InMemoryExpiryStore } from '@domio/expiry-service';
import { MeetingIntegrationService, InMemoryMeetingStore } from '@domio/meeting-integration-service';
import { CalendarService, InMemoryCalendarStore } from '@domio/calendar-service';
import { TaskManagerService, InMemoryTaskLinkStore } from '@domio/task-manager-service';
import { GuestService, InMemoryGuestStore } from '@domio/guests-service';

// ---------------------------------------------------------------------------
// Return type
// ---------------------------------------------------------------------------

export interface P18Services {
  collab: CollabService;
  permissions: PermissionService;
  suggestions: SuggestionsService;
  mergeRequests: MergeRequestService;
  library: LibraryService;
  expiry: ExpiryService;
  meeting: MeetingIntegrationService;
  calendar: CalendarService;
  tasks: TaskManagerService;
  guests: GuestService;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Instantiate all P18 services with in-memory stores.
 *
 * Each service reads `FEATURE_*_DISABLED` env vars via `checkFeature()`
 * internally — no action required here for feature flags.
 */
export function createP18Services(): P18Services {
  const collab = new CollabService({
    store: new InMemoryCollabStore(),
  });

  const permissions = new PermissionService({
    grants: new InMemoryPermissionGrantStore(),
    workspaceMembers: new InMemoryWorkspaceMemberStore(),
    groupMemberships: new InMemoryGroupMembershipStore(),
    resourceHierarchy: new InMemoryResourceHierarchyStore(),
  });

  const suggestions = new SuggestionsService({
    store: new InMemorySuggestionsStore(),
  });

  const mergeRequests = new MergeRequestService({
    store: new InMemoryMergeRequestStore(),
  });

  const library = new LibraryService({
    store: new InMemoryLibraryStore(),
  });

  const expiry = new ExpiryService({
    store: new InMemoryExpiryStore(),
  });

  const meeting = new MeetingIntegrationService({
    store: new InMemoryMeetingStore(),
  });

  const calendar = new CalendarService({
    store: new InMemoryCalendarStore(),
  });

  const tasks = new TaskManagerService({
    store: new InMemoryTaskLinkStore(),
  });

  const guests = new GuestService({
    store: new InMemoryGuestStore(),
  });

  return { collab, permissions, suggestions, mergeRequests, library, expiry, meeting, calendar, tasks, guests };
}
