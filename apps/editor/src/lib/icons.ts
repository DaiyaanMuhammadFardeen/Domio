/**
 * Icons — compact inline SVG icon set for the icon picker.
 * Each entry has an id, display name, SVG pathData, and searchable tags.
 */

export interface IconEntry {
  id: string;
  name: string;
  pathData: string;
  tags: string[];
}

export const ICONS: readonly IconEntry[] = [
  {
    id: 'arrow-right',
    name: 'Arrow Right',
    pathData: 'M5 12h14M12 5l7 7-7 7',
    tags: ['arrow', 'direction', 'forward', 'next'],
  },
  {
    id: 'arrow-left',
    name: 'Arrow Left',
    pathData: 'M19 12H5M12 19l-7-7 7-7',
    tags: ['arrow', 'direction', 'back', 'previous'],
  },
  {
    id: 'arrow-up',
    name: 'Arrow Up',
    pathData: 'M12 19V5M5 12l7-7 7 7',
    tags: ['arrow', 'direction', 'up', 'top'],
  },
  {
    id: 'arrow-down',
    name: 'Arrow Down',
    pathData: 'M12 5v14M19 12l-7 7-7-7',
    tags: ['arrow', 'direction', 'down', 'bottom'],
  },
  {
    id: 'check',
    name: 'Check',
    pathData: 'M20 6L9 17l-5-5',
    tags: ['check', 'done', 'success', 'confirm'],
  },
  {
    id: 'x',
    name: 'Close',
    pathData: 'M18 6L6 18M6 6l12 12',
    tags: ['close', 'cancel', 'remove', 'delete'],
  },
  {
    id: 'plus',
    name: 'Plus',
    pathData: 'M12 5v14M5 12h14',
    tags: ['add', 'new', 'create', 'plus'],
  },
  {
    id: 'minus',
    name: 'Minus',
    pathData: 'M5 12h14',
    tags: ['remove', 'subtract', 'minus'],
  },
  {
    id: 'search',
    name: 'Search',
    pathData: 'M11 3a8 8 0 100 16 8 8 0 000-16zM21 21l-4.35-4.35',
    tags: ['search', 'find', 'magnify', 'lookup'],
  },
  {
    id: 'settings',
    name: 'Settings',
    pathData:
      'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
    tags: ['settings', 'gear', 'cog', 'preferences', 'config'],
  },
  {
    id: 'star',
    name: 'Star',
    pathData:
      'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
    tags: ['star', 'favorite', 'bookmark', 'rating'],
  },
  {
    id: 'heart',
    name: 'Heart',
    pathData:
      'M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z',
    tags: ['heart', 'love', 'like', 'favorite'],
  },
  {
    id: 'info',
    name: 'Info',
    pathData:
      'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 16v-4M12 8h.01',
    tags: ['info', 'information', 'help', 'about'],
  },
  {
    id: 'warning',
    name: 'Warning',
    pathData:
      'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
    tags: ['warning', 'alert', 'danger', 'caution'],
  },
  {
    id: 'clock',
    name: 'Clock',
    pathData: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2',
    tags: ['clock', 'time', 'schedule', 'timer'],
  },
  {
    id: 'calendar',
    name: 'Calendar',
    pathData:
      'M19 4H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zM16 2v4M8 2v4M3 10h18',
    tags: ['calendar', 'date', 'event', 'schedule'],
  },
  {
    id: 'user',
    name: 'User',
    pathData: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
    tags: ['user', 'person', 'profile', 'account'],
  },
  {
    id: 'users',
    name: 'Users',
    pathData:
      'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
    tags: ['users', 'people', 'team', 'group'],
  },
  {
    id: 'globe',
    name: 'Globe',
    pathData:
      'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z',
    tags: ['globe', 'world', 'earth', 'web', 'internet'],
  },
  {
    id: 'lock',
    name: 'Lock',
    pathData:
      'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4',
    tags: ['lock', 'secure', 'password', 'private'],
  },
  {
    id: 'unlock',
    name: 'Unlock',
    pathData:
      'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 019.9-1',
    tags: ['unlock', 'open', 'access', 'public'],
  },
  {
    id: 'eye',
    name: 'Eye',
    pathData: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8zM12 15a3 3 0 100-6 3 3 0 000 6z',
    tags: ['eye', 'view', 'visible', 'show'],
  },
  {
    id: 'eye-off',
    name: 'Eye Off',
    pathData:
      'M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22',
    tags: ['eye', 'hidden', 'invisible', 'hide'],
  },
  {
    id: 'trash',
    name: 'Trash',
    pathData: 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2',
    tags: ['trash', 'delete', 'remove', 'bin'],
  },
  {
    id: 'edit',
    name: 'Edit',
    pathData:
      'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
    tags: ['edit', 'pencil', 'write', 'modify'],
  },
  {
    id: 'copy',
    name: 'Copy',
    pathData:
      'M20 9h-8a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-8a2 2 0 00-2-2zM4 15H3a2 2 0 01-2-2V3a2 2 0 012-2h10a2 2 0 012 2v1',
    tags: ['copy', 'duplicate', 'clone'],
  },
  {
    id: 'share',
    name: 'Share',
    pathData: 'M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13',
    tags: ['share', 'send', 'export'],
  },
  {
    id: 'download',
    name: 'Download',
    pathData: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
    tags: ['download', 'save', 'export'],
  },
  {
    id: 'upload',
    name: 'Upload',
    pathData: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12',
    tags: ['upload', 'import', 'send'],
  },
  {
    id: 'refresh',
    name: 'Refresh',
    pathData: 'M23 4v6h-6M1 20v-6h6M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15',
    tags: ['refresh', 'reload', 'sync', 'update'],
  },
  {
    id: 'zap',
    name: 'Zap',
    pathData: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    tags: ['zap', 'lightning', 'power', 'energy', 'fast'],
  },
  {
    id: 'target',
    name: 'Target',
    pathData:
      'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z',
    tags: ['target', 'goal', 'aim', 'focus'],
  },
  {
    id: 'layers',
    name: 'Layers',
    pathData: 'M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
    tags: ['layers', 'stack', 'overlap', 'depth'],
  },
];

const byId = new Map(ICONS.map((icon) => [icon.id, icon]));

export function getIcon(id: string): IconEntry | undefined {
  return byId.get(id);
}

export function searchIcons(query: string): readonly IconEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return ICONS;
  return ICONS.filter(
    (icon) =>
      icon.name.toLowerCase().includes(q) ||
      icon.tags.some((tag) => tag.includes(q)) ||
      icon.id.includes(q),
  );
}
