import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Books uploaded by users
export const books = sqliteTable("books", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  author: text("author").default("Unknown"),
  coverColor: text("cover_color").default("#6366f1"),
  fileName: text("file_name").notNull(),
  totalChapters: integer("total_chapters").default(0),
  totalCharacters: integer("total_characters").default(0),
  status: text("status").default("processing"), // processing, ready, error
  rawText: text("raw_text"), // full extracted text
  createdAt: text("created_at").default("now"),
});

// Characters detected in books
export const characters = sqliteTable("characters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id").notNull(),
  name: text("name").notNull(),
  description: text("description"), // extracted physical/personality description
  age: text("age"), // young, middle-aged, elderly
  gender: text("gender"), // male, female, non-binary
  accent: text("accent"), // British, American Southern, etc.
  personality: text("personality"), // brave, wise, cunning, etc.
  voiceTone: text("voice_tone"), // deep, high, raspy, smooth, etc.
  isWellKnown: integer("is_well_known", { mode: "boolean" }).default(false),
  wellKnownReference: text("well_known_reference"), // e.g., "Harry Potter from J.K. Rowling series"
  dialogueCount: integer("dialogue_count").default(0),
  voiceProfileId: integer("voice_profile_id"),
  colorTag: text("color_tag").default("#6366f1"), // UI color for this character
});

// Voice profiles (Character Voice DNA) — also stores per-character user overrides
export const voiceProfiles = sqliteTable("voice_profiles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  characterId: integer("character_id").notNull(),
  pitch: real("pitch").default(1.0), // 0.5 - 2.0
  rate: real("rate").default(1.0), // 0.5 - 2.0
  volume: real("volume").default(1.0), // 0 - 1
  voiceType: text("voice_type").default("default"), // deep, high, raspy, smooth, elderly, youthful
  accentStyle: text("accent_style").default("neutral"),
  emotionalBaseline: text("emotional_baseline").default("neutral"), // calm, energetic, somber, cheerful
  breathiness: real("breathiness").default(0.3), // 0 - 1
  resonance: text("resonance").default("medium"), // thin, medium, full, booming
  ageMarker: text("age_marker").default("adult"), // child, teen, young-adult, adult, elderly
  synthesisParams: text("synthesis_params"), // JSON string with full TTS parameters
  // User overrides (set via the per-character voice editor on the reader)
  selectedVoiceUri: text("selected_voice_uri"), // Web Speech voiceURI chosen by the user
  selectedVoiceName: text("selected_voice_name"), // Friendly name of the chosen voice
  genderOverride: text("gender_override"), // 'male' | 'female' | 'auto'
  agePreset: text("age_preset"), // 'younger' | 'adult' | 'older' | 'auto'
  crispness: real("crispness").default(0.5), // 0 - 1, maps to clarity/rate combo
  premiumVoiceId: text("premium_voice_id"), // Voice id from Premium TTS provider
  premiumProvider: text("premium_provider"), // 'elevenlabs' | 'openai' | 'google' | null
});

// User-level settings (single-row store; id=1)
export const userSettings = sqliteTable("user_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  premiumProvider: text("premium_provider"), // 'elevenlabs' | 'openai' | 'google' | null
  premiumApiKey: text("premium_api_key"), // BYOK — user supplies their own
  premiumEnabled: integer("premium_enabled", { mode: "boolean" }).default(false),
  // Subscription tier (set by Stripe webhook)
  tier: text("tier").default("free"), // 'free' | 'plus' | 'pro' | 'lifetime'
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: text("subscription_status"), // 'active' | 'canceled' | 'past_due' | null
  subscriptionRenewsAt: text("subscription_renews_at"), // ISO date
  email: text("email"), // user-provided for billing
});

// Dialogue segments extracted from books
export const dialogueSegments = sqliteTable("dialogue_segments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id").notNull(),
  characterId: integer("character_id"),
  chapterIndex: integer("chapter_index").default(0),
  segmentIndex: integer("segment_index").default(0),
  text: text("text").notNull(),
  isDialogue: integer("is_dialogue", { mode: "boolean" }).default(false),
  isNarration: integer("is_narration", { mode: "boolean" }).default(true),
  emotionalContext: text("emotional_context").default("neutral"), // happy, sad, angry, scared, etc.
  surroundingContext: text("surrounding_context"), // text around this segment for context
});

// Playback sessions
export const playbackSessions = sqliteTable("playback_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  bookId: integer("book_id").notNull(),
  currentSegmentId: integer("current_segment_id").default(0),
  playbackSpeed: real("playback_speed").default(1.0),
  lastPlayedAt: text("last_played_at"),
});

// Insert schemas
export const insertBookSchema = createInsertSchema(books).omit({ id: true, createdAt: true });
export const insertCharacterSchema = createInsertSchema(characters).omit({ id: true });
export const insertVoiceProfileSchema = createInsertSchema(voiceProfiles).omit({ id: true });
export const insertDialogueSegmentSchema = createInsertSchema(dialogueSegments).omit({ id: true });
export const insertPlaybackSessionSchema = createInsertSchema(playbackSessions).omit({ id: true });
export const insertUserSettingsSchema = createInsertSchema(userSettings).omit({ id: true });

// Types
export type Book = typeof books.$inferSelect;
export type InsertBook = z.infer<typeof insertBookSchema>;
export type Character = typeof characters.$inferSelect;
export type InsertCharacter = z.infer<typeof insertCharacterSchema>;
export type VoiceProfile = typeof voiceProfiles.$inferSelect;
export type InsertVoiceProfile = z.infer<typeof insertVoiceProfileSchema>;
export type DialogueSegment = typeof dialogueSegments.$inferSelect;
export type InsertDialogueSegment = z.infer<typeof insertDialogueSegmentSchema>;
export type PlaybackSession = typeof playbackSessions.$inferSelect;
export type InsertPlaybackSession = z.infer<typeof insertPlaybackSessionSchema>;
export type UserSettings = typeof userSettings.$inferSelect;
export type InsertUserSettings = z.infer<typeof insertUserSettingsSchema>;
