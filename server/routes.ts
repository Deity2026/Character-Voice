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

  // ---------------- User settings (Premium TTS BYOK) ----------------
  // Returns settings WITHOUT the API key (key never leaves the server)
  app.get("/api/settings", (_req: Request, res: Response) => {
    const s = storage.getUserSettings();
    if (!s) {
      return res.json({
        premiumProvider: null, premiumEnabled: false, hasApiKey: false,
        tier: "free", subscriptionStatus: null, subscriptionRenewsAt: null, email: null,
      });
    }
    res.json({
      premiumProvider: s.premiumProvider,
      premiumEnabled: !!s.premiumEnabled,
      hasApiKey: !!s.premiumApiKey,
      tier: s.tier || "free",
      subscriptionStatus: s.subscriptionStatus,
      subscriptionRenewsAt: s.subscriptionRenewsAt,
      email: s.email,
    });
  });

  app.post("/api/settings", (req: Request, res: Response) => {
    const { premiumProvider, premiumApiKey, premiumEnabled } = req.body || {};
    const update: any = {};
    if (premiumProvider !== undefined) update.premiumProvider = premiumProvider;
    if (premiumEnabled !== undefined) update.premiumEnabled = !!premiumEnabled;
    if (typeof premiumApiKey === "string" && premiumApiKey.length > 0) {
      update.premiumApiKey = premiumApiKey;
    }
    storage.upsertUserSettings(update);
    const s = storage.getUserSettings();
    res.json({
      premiumProvider: s?.premiumProvider ?? null,
      premiumEnabled: !!s?.premiumEnabled,
      hasApiKey: !!s?.premiumApiKey,
    });
  });

  app.post("/api/settings/clear-key", (_req: Request, res: Response) => {
    storage.upsertUserSettings({ premiumApiKey: null as any, premiumEnabled: false });
    res.json({ ok: true });
  });

  // ---------------- Stripe Checkout / Billing ----------------
  // Define plan price IDs via env vars (set in Render dashboard)
  // STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
  // STRIPE_PRICE_PLUS_MONTHLY, STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY, STRIPE_PRICE_LIFETIME
  app.get("/api/billing/plans", (_req: Request, res: Response) => {
    res.json({
      stripeConfigured: !!process.env.STRIPE_SECRET_KEY,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
      plans: {
        plus_monthly: { priceId: process.env.STRIPE_PRICE_PLUS_MONTHLY || null, amount: 499, interval: "month", tier: "plus" },
        pro_monthly: { priceId: process.env.STRIPE_PRICE_PRO_MONTHLY || null, amount: 999, interval: "month", tier: "pro" },
        pro_yearly: { priceId: process.env.STRIPE_PRICE_PRO_YEARLY || null, amount: 7900, interval: "year", tier: "pro" },
        lifetime: { priceId: process.env.STRIPE_PRICE_LIFETIME || null, amount: 14900, interval: "once", tier: "lifetime" },
      },
    });
  });

  app.post("/api/billing/checkout", async (req: Request, res: Response) => {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ error: "Billing not configured" });
      }
      const { plan, email } = req.body || {};
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" as any });

      const priceMap: Record<string, string | undefined> = {
        plus_monthly: process.env.STRIPE_PRICE_PLUS_MONTHLY,
        pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
        pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
        lifetime: process.env.STRIPE_PRICE_LIFETIME,
      };
      const priceId = priceMap[plan];
      if (!priceId) return res.status(400).json({ error: "Unknown plan" });

      const isLifetime = plan === "lifetime";
      const origin = req.headers.origin || `https://${req.headers.host}`;
      const session = await stripe.checkout.sessions.create({
        mode: isLifetime ? "payment" : "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: email || undefined,
        success_url: `${origin}/#/account?success=1`,
        cancel_url: `${origin}/#/pricing?canceled=1`,
        metadata: { plan },
        allow_promotion_codes: true,
      });
      res.json({ url: session.url });
    } catch (err: any) {
      console.error("Stripe checkout error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/billing/portal", async (req: Request, res: Response) => {
    try {
      if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(503).json({ error: "Billing not configured" });
      }
      const s = storage.getUserSettings();
      if (!s?.stripeCustomerId) return res.status(400).json({ error: "No active subscription" });
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" as any });
      const origin = req.headers.origin || `https://${req.headers.host}`;
      const portal = await stripe.billingPortal.sessions.create({
        customer: s.stripeCustomerId,
        return_url: `${origin}/#/account`,
      });
      res.json({ url: portal.url });
    } catch (err: any) {
      console.error("Stripe portal error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // Stripe webhook — must use raw body. Handled in server/index.ts middleware.
  app.post("/api/billing/webhook", async (req: Request, res: Response) => {
    try {
      if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_WEBHOOK_SECRET) {
        return res.status(503).end();
      }
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2024-12-18.acacia" as any });
      const sig = req.headers["stripe-signature"] as string;
      const event = stripe.webhooks.constructEvent(
        (req as any).rawBody || req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      const planToTier: Record<string, string> = {
        plus_monthly: "plus", pro_monthly: "pro", pro_yearly: "pro", lifetime: "lifetime",
      };

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as any;
          const plan = session.metadata?.plan;
          const tier = planToTier[plan] || "plus";
          storage.upsertUserSettings({
            tier,
            stripeCustomerId: session.customer || null,
            stripeSubscriptionId: session.subscription || null,
            subscriptionStatus: "active",
            email: session.customer_email || null,
          } as any);
          break;
        }
        case "customer.subscription.updated":
        case "customer.subscription.created": {
          const sub = event.data.object as any;
          storage.upsertUserSettings({
            stripeSubscriptionId: sub.id,
            stripeCustomerId: sub.customer,
            subscriptionStatus: sub.status,
            subscriptionRenewsAt: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
          } as any);
          break;
        }
        case "customer.subscription.deleted": {
          storage.upsertUserSettings({ tier: "free", subscriptionStatus: "canceled" } as any);
          break;
        }
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error("Webhook error:", err);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  });

  // List available premium voices for the configured provider
  app.get("/api/premium/voices", async (_req: Request, res: Response) => {
    try {
      const s = storage.getUserSettings();
      if (!s || !s.premiumApiKey || !s.premiumProvider) {
        return res.status(400).json({ error: "Premium provider not configured" });
      }
      // Tier gate: BYOK requires Plus+
      const tier = s.tier || "free";
      if (tier === "free") {
        return res.status(402).json({ error: "Plus or Pro subscription required", upgrade: true });
      }
      const voices = await listPremiumVoices(s.premiumProvider, s.premiumApiKey);
      res.json(voices);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Synthesize text using premium TTS (returns audio bytes)
  app.post("/api/premium/tts", async (req: Request, res: Response) => {
    try {
      const s = storage.getUserSettings();
      if (!s || !s.premiumApiKey || !s.premiumProvider || !s.premiumEnabled) {
        return res.status(400).json({ error: "Premium TTS not enabled" });
      }
      // Tier gate: premium TTS requires Plus+
      const tier = s.tier || "free";
      if (tier === "free") {
        return res.status(402).json({ error: "Plus or Pro subscription required", upgrade: true });
      }
      const { text, voiceId, pitch, rate } = req.body || {};
      if (!text || !voiceId) {
        return res.status(400).json({ error: "text and voiceId required" });
      }
      const audio = await synthesizePremium(
        s.premiumProvider,
        s.premiumApiKey,
        text,
        voiceId,
        { pitch, rate }
      );
      res.setHeader("Content-Type", audio.contentType);
      res.setHeader("Cache-Control", "no-store");
      res.send(Buffer.from(audio.bytes));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ---------------- Premium TTS Provider Adapters ----------------
// BYOK — user supplies their own API key. We never charge for these.
// Providers: 'elevenlabs', 'openai', 'google'

type PremiumVoice = { id: string; name: string; gender?: string; accent?: string; preview?: string };

async function listPremiumVoices(provider: string, apiKey: string): Promise<PremiumVoice[]> {
  if (provider === "elevenlabs") {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": apiKey },
    });
    if (!r.ok) throw new Error(`Provider error: ${r.status}`);
    const data: any = await r.json();
    return (data.voices || []).map((v: any) => ({
      id: v.voice_id,
      name: v.name,
      gender: v.labels?.gender,
      accent: v.labels?.accent,
      preview: v.preview_url,
    }));
  }
  if (provider === "openai") {
    // OpenAI TTS has fixed voice list (no API endpoint to list them)
    return [
      { id: "alloy", name: "Alloy", gender: "neutral" },
      { id: "ash", name: "Ash", gender: "male" },
      { id: "ballad", name: "Ballad", gender: "male" },
      { id: "coral", name: "Coral", gender: "female" },
      { id: "echo", name: "Echo", gender: "male" },
      { id: "fable", name: "Fable", gender: "male", accent: "british" },
      { id: "nova", name: "Nova", gender: "female" },
      { id: "onyx", name: "Onyx", gender: "male" },
      { id: "sage", name: "Sage", gender: "female" },
      { id: "shimmer", name: "Shimmer", gender: "female" },
      { id: "verse", name: "Verse", gender: "male" },
    ];
  }
  if (provider === "google") {
    const r = await fetch(
      `https://texttospeech.googleapis.com/v1/voices?key=${encodeURIComponent(apiKey)}&languageCode=en`
    );
    if (!r.ok) throw new Error(`Provider error: ${r.status}`);
    const data: any = await r.json();
    // Keep only standard / studio / wavenet en voices
    return (data.voices || [])
      .filter((v: any) => (v.languageCodes || []).some((l: string) => l.startsWith("en")))
      .map((v: any) => ({
        id: v.name,
        name: `${v.name} (${(v.languageCodes || [])[0]})`,
        gender: (v.ssmlGender || "").toLowerCase(),
        accent: (v.languageCodes || [])[0]?.includes("GB") ? "british" : "american",
      }));
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

async function synthesizePremium(
  provider: string,
  apiKey: string,
  text: string,
  voiceId: string,
  opts: { pitch?: number; rate?: number }
): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  if (provider === "elevenlabs") {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });
    if (!r.ok) throw new Error(`Provider error: ${r.status} ${await r.text()}`);
    return { bytes: await r.arrayBuffer(), contentType: "audio/mpeg" };
  }
  if (provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: voiceId,
        input: text,
        speed: Math.max(0.25, Math.min(4.0, opts.rate ?? 1.0)),
      }),
    });
    if (!r.ok) throw new Error(`Provider error: ${r.status} ${await r.text()}`);
    return { bytes: await r.arrayBuffer(), contentType: "audio/mpeg" };
  }
  if (provider === "google") {
    const ssml = `<speak><prosody pitch="${pitchToSt(opts.pitch ?? 1)}st" rate="${(opts.rate ?? 1).toFixed(2)}">${escapeXml(text)}</prosody></speak>`;
    const r = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { ssml },
          voice: { name: voiceId, languageCode: voiceId.split("-").slice(0, 2).join("-") },
          audioConfig: { audioEncoding: "MP3" },
        }),
      }
    );
    if (!r.ok) throw new Error(`Provider error: ${r.status} ${await r.text()}`);
    const data: any = await r.json();
    const bytes = Buffer.from(data.audioContent, "base64");
    return { bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), contentType: "audio/mpeg" };
  }
  throw new Error(`Unsupported provider: ${provider}`);
}

function pitchToSt(p: number): string {
  // Map 0.5..2.0 (web speech range) to roughly -8..+8 semitones
  const semis = (p - 1) * 12;
  return semis.toFixed(1);
}
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
