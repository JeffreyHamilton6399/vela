import { z } from 'zod';
import { DEFAULT_SEARCH_ENGINE_ID } from './search-engines.js';

/**
 * Everything Vela persists, in one schema. The store validates against this on
 * read, so a corrupt or hand-edited file degrades to defaults rather than
 * crashing the app.
 */
export const themePreferenceSchema = z.enum(['system', 'light', 'dark']);
export type ThemePreference = z.infer<typeof themePreferenceSchema>;

export const speedDialTileSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(120),
  url: z.string().max(4096),
  /** A locally cached favicon as a data URL. Never a remote address. */
  icon: z.string().max(200_000).nullable(),
});
export type SpeedDialTile = z.infer<typeof speedDialTileSchema>;

export const bookmarkSchema = z.object({
  id: z.string().min(1).max(64),
  title: z.string().max(200),
  url: z.string().max(4096),
  /** A locally cached favicon as a data URL. Never a remote address. */
  icon: z.string().max(200_000).nullable(),
});
export type Bookmark = z.infer<typeof bookmarkSchema>;

export const workspaceSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(60),
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const settingsSchema = z.object({
  version: z.literal(1).default(1),

  searchEngineId: z.string().min(1).default(DEFAULT_SEARCH_ENGINE_ID),
  theme: themePreferenceSchema.default('system'),

  /** Privacy toggles. Every one of these defaults to the private choice. */
  blockAdsAndTrackers: z.boolean().default(true),
  forceHttps: z.boolean().default(true),
  stripCrossOriginReferer: z.boolean().default(true),
  clearOnExit: z.boolean().default(false),
  checkForUpdates: z.boolean().default(true),

  /** Hosts the user chose to visit over plain http anyway. */
  httpAllowlist: z.array(z.string().max(255)).default([]),

  speedDial: z.array(speedDialTileSchema).default([]),
  workspaces: z.array(workspaceSchema).default([]),
  activeWorkspaceId: z.string().nullable().default(null),

  /** Sidebar notes. Local file, never synced anywhere. */
  notes: z.string().max(500_000).default(''),

  /** Minutes a background tab may idle before it is suspended. */
  suspendAfterMinutes: z.number().int().min(1).max(240).default(5),

  /** False until the first-run screen has been dismissed. */
  onboardingComplete: z.boolean().default(false),

  bookmarks: z.array(bookmarkSchema).default([]),
  showBookmarksBar: z.boolean().default(true),

  /**
   * Per-host zoom, as Chromium zoom levels (0 is 100%, each step is ~1.2x).
   * Keyed by host so a site stays at the size you left it.
   */
  zoomLevels: z.record(z.string().max(255), z.number().min(-8).max(9)).default({}),

  /** Whether to keep local browsing history at all. */
  keepHistory: z.boolean().default(true),

  /**
   * The user's own assistant key. Vela ships without one — an embedded key in
   * a downloadable app is readable by anyone who unzips it.
   */
  assistantApiKey: z.string().max(400).default(''),
  assistantModel: z.string().max(120).default('llama-3.3-70b-versatile'),

  /**
   * A proxy the user supplies, applied to every session. Vela runs no servers,
   * so it cannot offer a VPN of its own; this is where you point it at yours.
   */
  proxyRules: z.string().max(500).default(''),
});

export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = settingsSchema.parse({});

/**
 * The subset a settings panel may write. Spelled out rather than derived from
 * `settingsSchema.partial()`, because the field defaults there would turn an
 * absent key into a write. Everything not listed is app-managed: the renderer
 * cannot, for instance, add hosts to the plain-http allowlist by itself.
 */
export const settingsPatchSchema = z.object({
  searchEngineId: z.string().min(1).optional(),
  theme: themePreferenceSchema.optional(),
  blockAdsAndTrackers: z.boolean().optional(),
  forceHttps: z.boolean().optional(),
  stripCrossOriginReferer: z.boolean().optional(),
  clearOnExit: z.boolean().optional(),
  checkForUpdates: z.boolean().optional(),
  suspendAfterMinutes: z.number().int().min(1).max(240).optional(),
  onboardingComplete: z.boolean().optional(),
  showBookmarksBar: z.boolean().optional(),
  keepHistory: z.boolean().optional(),
  assistantApiKey: z.string().max(400).optional(),
  assistantModel: z.string().max(120).optional(),
  proxyRules: z.string().max(500).optional(),
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
