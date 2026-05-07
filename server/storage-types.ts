// Shared interface used by both DatabaseStorage (better-sqlite3) and MemoryStorage.
import type {
  Book, InsertBook,
  Character, InsertCharacter,
  VoiceProfile, InsertVoiceProfile,
  DialogueSegment, InsertDialogueSegment,
  PlaybackSession, InsertPlaybackSession,
  UserSettings, InsertUserSettings,
} from "@shared/schema";

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

  // User Settings (single-row store)
  getUserSettings(): UserSettings | undefined;
  upsertUserSettings(settings: InsertUserSettings): UserSettings;
}
