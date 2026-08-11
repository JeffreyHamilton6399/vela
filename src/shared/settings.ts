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
});

export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
