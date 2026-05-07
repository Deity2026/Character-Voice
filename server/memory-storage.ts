// In-memory fallback storage. Used on Render where native better-sqlite3
// fails to compile. Data is lost on restart — fine pre-launch, swap to
// Postgres before real users.
import type {
  Book, InsertBook,
  Character, InsertCharacter,
  VoiceProfile, InsertVoiceProfile,
  DialogueSegment, InsertDialogueSegment,
  PlaybackSession, InsertPlaybackSession,
  UserSettings, InsertUserSettings,
} from "@shared/schema";
import type { IStorage } from "./storage-types";

function nowIso() { return new Date().toISOString(); }

export class MemoryStorage implements IStorage {
  private books: Book[] = [];
  private characters: Character[] = [];
  private voiceProfiles: VoiceProfile[] = [];
  private segments: DialogueSegment[] = [];
  private sessions: PlaybackSession[] = [];
  private settings: UserSettings | undefined;
  private nextId = { book: 1, char: 1, vp: 1, seg: 1, sess: 1 };

  // Books
  getBooks(): Book[] { return [...this.books]; }
  getBook(id: number): Book | undefined { return this.books.find(b => b.id === id); }
  createBook(book: InsertBook): Book {
    const row = {
      id: this.nextId.book++,
      title: book.title,
      author: book.author ?? "Unknown",
      coverColor: (book as any).coverColor ?? "#6366f1",
      fileName: (book as any).fileName ?? "",
      totalChapters: (book as any).totalChapters ?? 0,
      totalCharacters: (book as any).totalCharacters ?? 0,
      status: (book as any).status ?? "processing",
      rawText: (book as any).rawText ?? null,
      createdAt: nowIso(),
    } as Book;
    this.books.push(row);
    return row;
  }
  updateBook(id: number, updates: Partial<InsertBook>): Book | undefined {
    const i = this.books.findIndex(b => b.id === id);
    if (i === -1) return undefined;
    this.books[i] = { ...this.books[i], ...updates } as Book;
    return this.books[i];
  }
  deleteBook(id: number): void {
    this.segments = this.segments.filter(s => s.bookId !== id);
    const charIds = this.characters.filter(c => c.bookId === id).map(c => c.id);
    this.voiceProfiles = this.voiceProfiles.filter(v => !charIds.includes(v.characterId));
    this.characters = this.characters.filter(c => c.bookId !== id);
    this.sessions = this.sessions.filter(s => s.bookId !== id);
    this.books = this.books.filter(b => b.id !== id);
  }

  // Characters
  getCharactersByBook(bookId: number): Character[] {
    return this.characters.filter(c => c.bookId === bookId);
  }
  getCharacter(id: number): Character | undefined {
    return this.characters.find(c => c.id === id);
  }
  createCharacter(character: InsertCharacter): Character {
    const row = { id: this.nextId.char++, ...(character as any) } as Character;
    this.characters.push(row);
    return row;
  }
  updateCharacter(id: number, updates: Partial<InsertCharacter>): Character | undefined {
    const i = this.characters.findIndex(c => c.id === id);
    if (i === -1) return undefined;
    this.characters[i] = { ...this.characters[i], ...updates } as Character;
    return this.characters[i];
  }

  // Voice Profiles
  getVoiceProfile(characterId: number): VoiceProfile | undefined {
    return this.voiceProfiles.find(v => v.characterId === characterId);
  }
  createVoiceProfile(profile: InsertVoiceProfile): VoiceProfile {
    const row = { id: this.nextId.vp++, ...(profile as any) } as VoiceProfile;
    this.voiceProfiles.push(row);
    return row;
  }
  updateVoiceProfile(id: number, updates: Partial<InsertVoiceProfile>): VoiceProfile | undefined {
    const i = this.voiceProfiles.findIndex(v => v.id === id);
    if (i === -1) return undefined;
    this.voiceProfiles[i] = { ...this.voiceProfiles[i], ...updates } as VoiceProfile;
    return this.voiceProfiles[i];
  }

  // Segments
  getSegmentsByBook(bookId: number): DialogueSegment[] {
    return this.segments.filter(s => s.bookId === bookId);
  }
  getSegmentsByChapter(bookId: number, chapter: number): DialogueSegment[] {
    return this.segments.filter(s => s.bookId === bookId && s.chapterIndex === chapter);
  }
  createSegment(segment: InsertDialogueSegment): DialogueSegment {
    const row = { id: this.nextId.seg++, ...(segment as any) } as DialogueSegment;
    this.segments.push(row);
    return row;
  }
  createSegments(segments: InsertDialogueSegment[]): void {
    for (const s of segments) this.createSegment(s);
  }

  // Playback
  getPlaybackSession(bookId: number): PlaybackSession | undefined {
    return this.sessions.find(s => s.bookId === bookId);
  }
  upsertPlaybackSession(session: InsertPlaybackSession): PlaybackSession {
    const i = this.sessions.findIndex(s => s.bookId === session.bookId);
    if (i !== -1) {
      this.sessions[i] = { ...this.sessions[i], ...(session as any) } as PlaybackSession;
      return this.sessions[i];
    }
    const row = { id: this.nextId.sess++, ...(session as any) } as PlaybackSession;
    this.sessions.push(row);
    return row;
  }

  // Settings
  getUserSettings(): UserSettings | undefined { return this.settings; }
  upsertUserSettings(settings: InsertUserSettings): UserSettings {
    this.settings = { id: 1, ...(this.settings ?? {}), ...(settings as any) } as UserSettings;
    return this.settings;
  }
}
