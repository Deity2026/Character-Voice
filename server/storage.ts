import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { eq, and } from "drizzle-orm";
import {
  books, characters, voiceProfiles, dialogueSegments, playbackSessions,
  type Book, type InsertBook,
  type Character, type InsertCharacter,
  type VoiceProfile, type InsertVoiceProfile,
  type DialogueSegment, type InsertDialogueSegment,
  type PlaybackSession, type InsertPlaybackSession,
} from "@shared/schema";

// On Render's free tier the filesystem is ephemeral and there's no persistent disk.
// Use an in-memory SQLite DB in production so the app works reliably across cold starts.
// In development (local), use a file-backed DB for convenience.
const dbPath = process.env.DATABASE_PATH
  || (process.env.NODE_ENV === "production" ? ":memory:" : "charactervoice.db");
const sqlite = new Database(dbPath);
if (dbPath !== ":memory:") {
  sqlite.pragma("journal_mode = WAL");
}

export const db = drizzle(sqlite);

// Create tables
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
    synthesis_params TEXT
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

export interface IStorage {
  // Books
  getBooks(): Book[];
  getBook(id: number): Book | undefined;
  createBook(book: InsertBook): Book;
  updateBook(id: number, updates: Partial<InsertBook>): Book | undefined;
  deleteBook(id: number): void;

  // Characters
  getCharactersByBook(bookId: number): Character[];
  getCharacter(id: number): Character | undefined;
  createCharacter(character: InsertCharacter): Character;
  updateCharacter(id: number, updates: Partial<InsertCharacter>): Character | undefined;

  // Voice Profiles
  getVoiceProfile(characterId: number): VoiceProfile | undefined;
  createVoiceProfile(profile: InsertVoiceProfile): VoiceProfile;
  updateVoiceProfile(id: number, updates: Partial<InsertVoiceProfile>): VoiceProfile | undefined;

  // Dialogue Segments
  getSegmentsByBook(bookId: number): DialogueSegment[];
  getSegmentsByChapter(bookId: number, chapter: number): DialogueSegment[];
  createSegment(segment: InsertDialogueSegment): DialogueSegment;
  createSegments(segments: InsertDialogueSegment[]): void;

  // Playback
  getPlaybackSession(bookId: number): PlaybackSession | undefined;
  upsertPlaybackSession(session: InsertPlaybackSession): PlaybackSession;
}

export class DatabaseStorage implements IStorage {
  // Books
  getBooks(): Book[] {
    return db.select().from(books).all();
  }

  getBook(id: number): Book | undefined {
    return db.select().from(books).where(eq(books.id, id)).get();
  }

  createBook(book: InsertBook): Book {
    return db.insert(books).values(book).returning().get();
  }

  updateBook(id: number, updates: Partial<InsertBook>): Book | undefined {
    return db.update(books).set(updates).where(eq(books.id, id)).returning().get();
  }

  deleteBook(id: number): void {
    // Delete related data first
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
}

export const storage = new DatabaseStorage();
