// Storage layer with graceful fallback.
// - Local dev / Render with native build working: SQLite via better-sqlite3
// - Render free tier where native compile fails: in-memory store
//
// Both implement IStorage so routes don't need to know which one is active.
import { eq, and } from "drizzle-orm";
import {
  books, characters, voiceProfiles, dialogueSegments, playbackSessions, userSettings,
  type Book, type InsertBook,
  type Character, type InsertCharacter,
  type VoiceProfile, type InsertVoiceProfile,
  type DialogueSegment, type InsertDialogueSegment,
  type PlaybackSession, type InsertPlaybackSession,
  type UserSettings, type InsertUserSettings,
} from "@shared/schema";
import { createRequire } from "module";
import type { IStorage } from "./storage-types";
import { MemoryStorage } from "./memory-storage";

export type { IStorage } from "./storage-types";

// Force memory mode with env var (useful on Render where native build fails)
const FORCE_MEMORY = process.env.STORAGE_DRIVER === "memory";

let storageImpl: IStorage;

if (FORCE_MEMORY) {
  console.log("[storage] STORAGE_DRIVER=memory — using in-memory store");
  storageImpl = new MemoryStorage();
} else {
  try {
    // Synchronous require so a missing native binary just throws, caught below.
    // Using createRequire keeps this working in both ESM (dev) and CJS (prod bundle).
    const req = createRequire(import.meta.url);
    const Database = req("better-sqlite3");
    const { drizzle } = req("drizzle-orm/better-sqlite3");

    const dbPath = process.env.DATABASE_PATH
      || (process.env.NODE_ENV === "production" ? ":memory:" : "charactervoice.db");
    const sqlite = new Database(dbPath);
    if (dbPath !== ":memory:") {
      sqlite.pragma("journal_mode = WAL");
    }
    const db = drizzle(sqlite);

    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS books (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        author TEXT DEFAULT 'Unknown',
        cover_color TEXT DEFAULT '#6366f1',
        file_name TEXT NOT NULL,
        total_chapters INTEGER DEFAULT 0,
        total_characters INTEGER DEFAULT 0,
        status TEXT DEFAULT 'processing',
        raw_text TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS characters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        age TEXT,
        gender TEXT,
        accent TEXT,
        personality TEXT,
        voice_tone TEXT,
        is_well_known INTEGER DEFAULT 0,
        well_known_reference TEXT,
        dialogue_count INTEGER DEFAULT 0,
        voice_profile_id INTEGER,
        color_tag TEXT DEFAULT '#6366f1'
      );

      CREATE TABLE IF NOT EXISTS voice_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        character_id INTEGER NOT NULL,
        pitch REAL DEFAULT 1.0,
        rate REAL DEFAULT 1.0,
        volume REAL DEFAULT 1.0,
        voice_type TEXT DEFAULT 'default',
        accent_style TEXT DEFAULT 'neutral',
        emotional_baseline TEXT DEFAULT 'neutral',
        breathiness REAL DEFAULT 0.3,
        resonance TEXT DEFAULT 'medium',
        age_marker TEXT DEFAULT 'adult',
        synthesis_params TEXT,
        selected_voice_uri TEXT,
        selected_voice_name TEXT,
        gender_override TEXT,
        age_preset TEXT,
        crispness REAL DEFAULT 0.5,
        premium_voice_id TEXT,
        premium_provider TEXT
      );

      CREATE TABLE IF NOT EXISTS user_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        premium_provider TEXT,
        premium_api_key TEXT,
        premium_enabled INTEGER DEFAULT 0,
        tier TEXT DEFAULT 'none',
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        subscription_status TEXT,
        subscription_renews_at TEXT,
        email TEXT
      );

      CREATE TABLE IF NOT EXISTS dialogue_segments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        character_id INTEGER,
        chapter_index INTEGER DEFAULT 0,
        segment_index INTEGER DEFAULT 0,
        text TEXT NOT NULL,
        is_dialogue INTEGER DEFAULT 0,
        is_narration INTEGER DEFAULT 1,
        emotional_context TEXT DEFAULT 'neutral',
        surrounding_context TEXT
      );

      CREATE TABLE IF NOT EXISTS playback_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        book_id INTEGER NOT NULL,
        current_segment_id INTEGER DEFAULT 0,
        playback_speed REAL DEFAULT 1.0,
        last_played_at TEXT
      );
    `);

    class DatabaseStorage implements IStorage {
      // Books
      getBooks(): Book[] { return db.select().from(books).all(); }
      getBook(id: number): Book | undefined { return db.select().from(books).where(eq(books.id, id)).get(); }
      createBook(book: InsertBook): Book { return db.insert(books).values(book).returning().get(); }
      updateBook(id: number, updates: Partial<InsertBook>): Book | undefined {
        return db.update(books).set(updates).where(eq(books.id, id)).returning().get();
      }
      deleteBook(id: number): void {
        db.delete(dialogueSegments).where(eq(dialogueSegments.bookId, id)).run();
        const chars = db.select().from(characters).where(eq(characters.bookId, id)).all();
        for (const char of chars) {
          db.delete(voiceProfiles).where(eq(voiceProfiles.characterId, char.id)).run();
        }
        db.delete(characters).where(eq(characters.bookId, id)).run();
        db.delete(playbackSessions).where(eq(playbackSessions.bookId, id)).run();
        db.delete(books).where(eq(books.id, id)).run();
      }

      // Characters
      getCharactersByBook(bookId: number): Character[] {
        return db.select().from(characters).where(eq(characters.bookId, bookId)).all();
      }
      getCharacter(id: number): Character | undefined {
        return db.select().from(characters).where(eq(characters.id, id)).get();
      }
      createCharacter(character: InsertCharacter): Character {
        return db.insert(characters).values(character).returning().get();
      }
      updateCharacter(id: number, updates: Partial<InsertCharacter>): Character | undefined {
        return db.update(characters).set(updates).where(eq(characters.id, id)).returning().get();
      }

      // Voice Profiles
      getVoiceProfile(characterId: number): VoiceProfile | undefined {
        return db.select().from(voiceProfiles).where(eq(voiceProfiles.characterId, characterId)).get();
      }
      createVoiceProfile(profile: InsertVoiceProfile): VoiceProfile {
        return db.insert(voiceProfiles).values(profile).returning().get();
      }
      updateVoiceProfile(id: number, updates: Partial<InsertVoiceProfile>): VoiceProfile | undefined {
        return db.update(voiceProfiles).set(updates).where(eq(voiceProfiles.id, id)).returning().get();
      }

      // Dialogue Segments
      getSegmentsByBook(bookId: number): DialogueSegment[] {
        return db.select().from(dialogueSegments).where(eq(dialogueSegments.bookId, bookId)).all();
      }
      getSegmentsByChapter(bookId: number, chapter: number): DialogueSegment[] {
        return db.select().from(dialogueSegments)
          .where(and(eq(dialogueSegments.bookId, bookId), eq(dialogueSegments.chapterIndex, chapter)))
          .all();
      }
      createSegment(segment: InsertDialogueSegment): DialogueSegment {
        return db.insert(dialogueSegments).values(segment).returning().get();
      }
      createSegments(segments: InsertDialogueSegment[]): void {
        if (segments.length === 0) return;
        for (const segment of segments) {
          db.insert(dialogueSegments).values(segment).run();
        }
      }

      // Playback
      getPlaybackSession(bookId: number): PlaybackSession | undefined {
        return db.select().from(playbackSessions).where(eq(playbackSessions.bookId, bookId)).get();
      }
      upsertPlaybackSession(session: InsertPlaybackSession): PlaybackSession {
        const existing = this.getPlaybackSession(session.bookId);
        if (existing) {
          return db.update(playbackSessions)
            .set(session)
            .where(eq(playbackSessions.bookId, session.bookId))
            .returning().get();
        }
        return db.insert(playbackSessions).values(session).returning().get();
      }

      // User Settings
      getUserSettings(): UserSettings | undefined {
        return db.select().from(userSettings).where(eq(userSettings.id, 1)).get();
      }
      upsertUserSettings(settings: InsertUserSettings): UserSettings {
        const existing = this.getUserSettings();
        if (existing) {
          return db.update(userSettings)
            .set(settings)
            .where(eq(userSettings.id, 1))
            .returning().get();
        }
        return db.insert(userSettings).values({ ...settings, id: 1 } as any).returning().get();
      }
    }

    storageImpl = new DatabaseStorage();
    console.log(`[storage] better-sqlite3 ready (${dbPath})`);
  } catch (err) {
    console.warn("[storage] better-sqlite3 unavailable, falling back to in-memory store:",
      (err as Error).message);
    storageImpl = new MemoryStorage();
  }
}

export const storage: IStorage = storageImpl;
