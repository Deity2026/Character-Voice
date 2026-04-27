import type { Express, Request, Response } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import {
  parseTextIntoSegments,
  buildCharacterProfiles,
  DEMO_BOOK_TEXT,
  DEMO_BOOK_TITLE,
  DEMO_BOOK_AUTHOR,
} from "./characterEngine";

export async function registerRoutes(server: Server, app: Express) {
  // Get all books
  app.get("/api/books", (_req: Request, res: Response) => {
    const books = storage.getBooks();
    res.json(books);
  });

  // Get single book
  app.get("/api/books/:id", (req: Request, res: Response) => {
    const book = storage.getBook(Number(req.params.id));
    if (!book) return res.status(404).json({ error: "Book not found" });
    res.json(book);
  });

  // Upload / create a book from text
  app.post("/api/books", (req: Request, res: Response) => {
    try {
      const { title, author, text } = req.body;
      if (!title || !text) {
        return res.status(400).json({ error: "Title and text are required" });
      }

      // Create the book record
      const book = storage.createBook({
        title,
        author: author || "Unknown",
        fileName: `${title.replace(/\s+/g, "_").toLowerCase()}.txt`,
        rawText: text,
        status: "processing",
        coverColor: getRandomColor(),
      });

      // Process in "background" (synchronous for demo, would be async in production)
      processBook(book.id, text);

      const updatedBook = storage.getBook(book.id);
      res.json(updatedBook);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Load demo book
  app.post("/api/books/demo", (_req: Request, res: Response) => {
    try {
      // Check if demo already exists
      const existing = storage.getBooks().find(b => b.title === DEMO_BOOK_TITLE);
      if (existing) {
        return res.json(existing);
      }

      const book = storage.createBook({
        title: DEMO_BOOK_TITLE,
        author: DEMO_BOOK_AUTHOR,
        fileName: "demo_pride_and_prejudice.txt",
        rawText: DEMO_BOOK_TEXT,
        status: "processing",
        coverColor: "#7c3aed",
      });

      processBook(book.id, DEMO_BOOK_TEXT);
      const updatedBook = storage.getBook(book.id);
      res.json(updatedBook);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Delete a book
  app.delete("/api/books/:id", (req: Request, res: Response) => {
    storage.deleteBook(Number(req.params.id));
    res.json({ success: true });
  });

  // Get characters for a book
  app.get("/api/books/:id/characters", (req: Request, res: Response) => {
    const chars = storage.getCharactersByBook(Number(req.params.id));
    res.json(chars);
  });

  // Get character with voice profile
  app.get("/api/characters/:id", (req: Request, res: Response) => {
    const char = storage.getCharacter(Number(req.params.id));
    if (!char) return res.status(404).json({ error: "Character not found" });
    const voiceProfile = storage.getVoiceProfile(char.id);
    res.json({ ...char, voiceProfile });
  });

  // Update character voice profile
  app.patch("/api/characters/:id/voice", (req: Request, res: Response) => {
    const charId = Number(req.params.id);
    const char = storage.getCharacter(charId);
    if (!char) return res.status(404).json({ error: "Character not found" });

    const profile = storage.getVoiceProfile(charId);
    if (profile) {
      const updated = storage.updateVoiceProfile(profile.id, req.body);
      res.json(updated);
    } else {
      const created = storage.createVoiceProfile({ characterId: charId, ...req.body });
      res.json(created);
    }
  });

  // Get dialogue segments for a book
  app.get("/api/books/:id/segments", (req: Request, res: Response) => {
    const segments = storage.getSegmentsByBook(Number(req.params.id));
    res.json(segments);
  });

  // Get segments by chapter
  app.get("/api/books/:id/chapters/:chapter/segments", (req: Request, res: Response) => {
    const segments = storage.getSegmentsByChapter(
      Number(req.params.id),
      Number(req.params.chapter)
    );
    res.json(segments);
  });

  // Get/update playback session
  app.get("/api/books/:id/playback", (req: Request, res: Response) => {
    const session = storage.getPlaybackSession(Number(req.params.id));
    res.json(session || { bookId: Number(req.params.id), currentSegmentId: 0, playbackSpeed: 1.0 });
  });

  app.post("/api/books/:id/playback", (req: Request, res: Response) => {
    const session = storage.upsertPlaybackSession({
      bookId: Number(req.params.id),
      ...req.body,
      lastPlayedAt: new Date().toISOString(),
    });
    res.json(session);
  });
}

// Process a book: parse text, detect characters, build voice profiles
function processBook(bookId: number, text: string) {
  try {
    // Step 1: Parse text into segments
    const { segments, detectedCharacters } = parseTextIntoSegments(text, bookId);

    // Step 2: Build character profiles with Voice DNA
    const { characters: charProfiles, voiceProfiles } = buildCharacterProfiles(
      detectedCharacters,
      bookId,
      text
    );

    // Step 3: Create characters and voice profiles in DB
    const characterMap = new Map<string, number>(); // name -> id

    for (const charProfile of charProfiles) {
      const created = storage.createCharacter(charProfile);
      characterMap.set(charProfile.name, created.id);

      // Create voice profile
      const vp = voiceProfiles.get(charProfile.name);
      if (vp) {
        const profile = storage.createVoiceProfile({ ...vp, characterId: created.id });
        storage.updateCharacter(created.id, { voiceProfileId: profile.id });
      }
    }

    // Step 4: Link segments to characters and save
    // Also add a narrator character
    const narrator = storage.createCharacter({
      bookId,
      name: "Narrator",
      description: "The book's narrator voice",
      age: "adult",
      gender: "neutral",
      accent: "neutral",
      personality: "observant, descriptive",
      voiceTone: "calm, measured, clear",
      isWellKnown: false,
      wellKnownReference: null,
      dialogueCount: segments.filter(s => s.isNarration).length,
      voiceProfileId: null,
      colorTag: "#64748b",
    });

    const narratorProfile = storage.createVoiceProfile({
      characterId: narrator.id,
      pitch: 1.0,
      rate: 0.95,
      volume: 1.0,
      voiceType: "smooth",
      accentStyle: "neutral",
      emotionalBaseline: "calm",
      breathiness: 0.2,
      resonance: "medium",
      ageMarker: "adult",
      synthesisParams: JSON.stringify({ pitch: 1.0, rate: 0.95, voiceType: "smooth" }),
    });

    storage.updateCharacter(narrator.id, { voiceProfileId: narratorProfile.id });

    // Update segments with character IDs
    const linkedSegments = segments.map(seg => {
      if (seg.isNarration) {
        return { ...seg, characterId: narrator.id };
      }
      // Try to find the character for this dialogue
      // Simple heuristic: check surrounding context for character names
      for (const [charName, charId] of characterMap) {
        if (seg.surroundingContext && seg.surroundingContext.toLowerCase().includes(charName.toLowerCase())) {
          return { ...seg, characterId: charId };
        }
      }
      return { ...seg, characterId: narrator.id };
    });

    storage.createSegments(linkedSegments);

    // Step 5: Update book status
    const chapterCount = new Set(segments.map(s => s.chapterIndex)).size;
    storage.updateBook(bookId, {
      status: "ready",
      totalChapters: chapterCount || 1,
      totalCharacters: charProfiles.length + 1, // +1 for narrator
    });
  } catch (err) {
    console.error("Error processing book:", err);
    storage.updateBook(bookId, { status: "error" });
  }
}

function getRandomColor(): string {
  const colors = ["#6366f1", "#ec4899", "#f59e0b", "#10b981", "#8b5cf6", "#ef4444", "#06b6d4", "#7c3aed", "#0ea5e9"];
  return colors[Math.floor(Math.random() * colors.length)];
}
