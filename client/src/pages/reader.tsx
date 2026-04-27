import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/hooks/use-toast";
import type { Book, Character, DialogueSegment, VoiceProfile } from "@shared/schema";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Sun, Moon, ArrowLeft, Users, Mic2, Settings, Sparkles, RotateCcw, X
} from "lucide-react";

// ===========================================================================
// Voice gender / accent inference for Web Speech API voices
// ===========================================================================
const FEMALE_NAME_HINTS = [
  "female","woman","girl",
  "samantha","victoria","karen","moira","tessa","fiona","susan","allison","ava","kate",
  "serena","zira","hazel","libby","olivia","emma","jenny","aria","michelle",
  "sonia","elsa","sandy","vicki","kimberly","salli","joanna","ivy","ruth",
  "amy","emily","ada","google uk english female","google us english"
];
const MALE_NAME_HINTS = [
  "male","man","boy",
  "daniel","alex","david","fred","oliver","thomas","tom","mark","james",
  "ryan","george","guy","matthew","justin","john","michael","william",
  "arthur","brian","diego","jorge","liam","ethan","noah","google uk english male"
];

function inferVoiceGender(v: SpeechSynthesisVoice): "male" | "female" | "unknown" {
  const n = v.name.toLowerCase();
  if (FEMALE_NAME_HINTS.some(h => n.includes(h))) return "female";
  if (MALE_NAME_HINTS.some(h => n.includes(h))) return "male";
  return "unknown";
}

function voiceAccentLabel(v: SpeechSynthesisVoice): string {
  const l = v.lang.toLowerCase();
  if (l.startsWith("en-gb") || l.startsWith("en_gb")) return "British";
  if (l.startsWith("en-us") || l.startsWith("en_us")) return "American";
  if (l.startsWith("en-au") || l.startsWith("en_au")) return "Australian";
  if (l.startsWith("en-in") || l.startsWith("en_in")) return "Indian";
  if (l.startsWith("en-ie") || l.startsWith("en_ie")) return "Irish";
  if (l.startsWith("en-za") || l.startsWith("en_za")) return "South African";
  if (l.startsWith("en")) return "English";
  return v.lang;
}

// ===========================================================================
// Default voice profile derivation (when no override yet)
// ===========================================================================
function deriveDefaultsFromCharacter(char: Character | null | undefined) {
  if (!char || char.name === "Narrator") {
    return { pitch: 0.95, rate: 0.92, crispness: 0.65, agePreset: "adult", genderOverride: "auto" };
  }
  const age = (char.age || "").toLowerCase();
  const gender = (char.gender || "").toLowerCase();
  const tone = (char.voiceTone || "").toLowerCase();
  const personality = (char.personality || "").toLowerCase();

  let pitch = 1.0;
  let rate = 1.0;

  if (gender === "female") pitch = 1.18;
  else if (gender === "male") pitch = 0.82;

  if (age === "elderly") { pitch *= 0.92; rate *= 0.88; }
  else if (age === "young") { pitch *= 1.06; rate *= 1.03; }
  else if (age === "middle-aged" || age === "adult") { pitch *= 0.98; }

  if (tone.includes("deep") || tone.includes("gravelly") || tone.includes("resonant")) pitch *= 0.9;
  if (tone.includes("high") || tone.includes("bright") || tone.includes("lively") || tone.includes("youthful")) pitch *= 1.05;
  if (tone.includes("rapid") || tone.includes("brisk") || tone.includes("quick")) rate *= 1.1;
  if (tone.includes("slow") || tone.includes("measured") || tone.includes("calm") || tone.includes("formal")) rate *= 0.92;
  if (tone.includes("sharp") || tone.includes("crisp")) rate *= 1.05;

  if (personality.includes("witty") || personality.includes("playful") || personality.includes("spirited")) pitch *= 1.03;
  if (personality.includes("reserved") || personality.includes("proud") || personality.includes("stern")) rate *= 0.95;
  if (personality.includes("intense") || personality.includes("obsessive")) rate *= 1.05;

  // Per-character jitter (deterministic) so same-gender chars sound different
  const jitter = ((char.id * 9301 + 49297) % 233280) / 233280;
  pitch *= 0.95 + jitter * 0.1;
  rate *= 0.97 + jitter * 0.06;

  return {
    pitch: Math.max(0.5, Math.min(2.0, pitch)),
    rate: Math.max(0.5, Math.min(2.0, rate)),
    crispness: 0.5,
    agePreset: age === "elderly" ? "older" : age === "young" ? "younger" : "adult",
    genderOverride: "auto",
  };
}

// Map crispness 0..1 to a small rate boost and slight pitch tightening
function applyCrispness(base: { pitch: number; rate: number }, crispness: number) {
  const c = Math.max(0, Math.min(1, crispness));
  const rateBoost = 1 + (c - 0.5) * 0.12; // ±6% rate
  const pitchBoost = 1 + (c - 0.5) * 0.04; // ±2% pitch (tiny — clarity, not chipmunk)
  return { pitch: base.pitch * pitchBoost, rate: base.rate * rateBoost };
}

// ===========================================================================
// Reader Page
// ===========================================================================

export default function ReaderPage() {
  const params = useParams<{ id: string }>();
  const bookId = Number(params.id);
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [showCharPanel, setShowCharPanel] = useState(true); // auto-open
  const [editingCharacterId, setEditingCharacterId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: book } = useQuery<Book>({
    queryKey: ["/api/books", bookId],
    queryFn: () => apiRequest("GET", `/api/books/${bookId}`).then(r => r.json()),
  });

  const { data: characters = [] } = useQuery<Character[]>({
    queryKey: ["/api/books", bookId, "characters"],
    queryFn: () => apiRequest("GET", `/api/books/${bookId}/characters`).then(r => r.json()),
    enabled: !!book,
  });

  const { data: segments = [] } = useQuery<DialogueSegment[]>({
    queryKey: ["/api/books", bookId, "segments"],
    queryFn: () => apiRequest("GET", `/api/books/${bookId}/segments`).then(r => r.json()),
    enabled: !!book,
  });

  // ---- Premium settings (BYOK) ----
  const { data: settings } = useQuery<{
    premiumProvider: string | null;
    premiumEnabled: boolean;
    hasApiKey: boolean;
  }>({
    queryKey: ["/api/settings"],
    queryFn: () => apiRequest("GET", "/api/settings").then(r => r.json()),
  });

  const premiumActive = !!settings?.premiumEnabled && !!settings?.hasApiKey;

  const { data: premiumVoices = [] } = useQuery<{ id: string; name: string; gender?: string; accent?: string }[]>({
    queryKey: ["/api/premium/voices"],
    queryFn: () => apiRequest("GET", "/api/premium/voices").then(r => r.json()),
    enabled: premiumActive,
  });

  // ---- Per-character voice profiles (overrides) ----
  // We fetch all profiles once and key them by characterId
  const { data: profilesArr = [] } = useQuery<({ characterId: number } & Partial<VoiceProfile>)[]>({
    queryKey: ["/api/books", bookId, "voice-profiles"],
    queryFn: async () => {
      // Build a fetch for each char's profile via /api/characters/:id (returns voiceProfile)
      const chars: Character[] = await apiRequest("GET", `/api/books/${bookId}/characters`).then(r => r.json());
      const results = await Promise.all(
        chars.map(async (c) => {
          const data = await apiRequest("GET", `/api/characters/${c.id}`).then(r => r.json());
          return { characterId: c.id, ...(data.voiceProfile || {}) };
        })
      );
      return results;
    },
    enabled: !!book && characters.length > 0,
  });

  const profileMap = useMemo(() => {
    const m = new Map<number, Partial<VoiceProfile>>();
    for (const p of profilesArr) m.set(p.characterId, p);
    return m;
  }, [profilesArr]);

  const charMap = useMemo(() => new Map(characters.map(c => [c.id, c])), [characters]);
  const currentSegment = segments[currentSegmentIndex];
  const currentCharacter = currentSegment ? charMap.get(currentSegment.characterId ?? 0) : null;

  // ---- Save voice override ----
  const saveProfile = useMutation({
    mutationFn: async ({ characterId, updates }: { characterId: number; updates: Partial<VoiceProfile> }) => {
      return apiRequest("PATCH", `/api/characters/${characterId}/voice`, updates).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/books", bookId, "voice-profiles"] });
    },
  });

  // ---------------------------------------------------------------------------
  // Voice pool (Web Speech)
  // ---------------------------------------------------------------------------
  const [allVoices, setAllVoices] = useState<SpeechSynthesisVoice[]>([]);

  const refreshVoices = useCallback(() => {
    const all = window.speechSynthesis.getVoices();
    const englishOnly = all.filter(v => v.lang.toLowerCase().startsWith("en"));
    setAllVoices(englishOnly);
  }, []);

  useEffect(() => {
    refreshVoices();
    const handler = () => refreshVoices();
    window.speechSynthesis.onvoiceschanged = handler;
    const t1 = setTimeout(refreshVoices, 250);
    const t2 = setTimeout(refreshVoices, 1000);
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      clearTimeout(t1); clearTimeout(t2);
    };
  }, [refreshVoices]);

  // Group voices by accent + gender for the picker
  const voicesByGroup = useMemo(() => {
    const groups: Record<string, SpeechSynthesisVoice[]> = {
      "British · Male": [], "British · Female": [],
      "American · Male": [], "American · Female": [],
      "Australian": [], "Other English": [],
    };
    for (const v of allVoices) {
      const accent = voiceAccentLabel(v);
      const gender = inferVoiceGender(v);
      const key =
        accent === "British" ? `British · ${gender === "female" ? "Female" : "Male"}` :
        accent === "American" ? `American · ${gender === "female" ? "Female" : "Male"}` :
        accent === "Australian" ? "Australian" :
        "Other English";
      groups[key].push(v);
    }
    return groups;
  }, [allVoices]);

  // Pick best matching voice for a character based on profile + auto-detection
  const getVoiceForCharacter = useCallback((char: Character | null | undefined): SpeechSynthesisVoice | null => {
    if (allVoices.length === 0) return null;

    const profile = char ? profileMap.get(char.id) : undefined;

    // Honor explicit user choice first
    if (profile?.selectedVoiceUri) {
      const chosen = allVoices.find(v => v.voiceURI === profile.selectedVoiceUri);
      if (chosen) return chosen;
    }

    // Narrator gets crisp British male preference
    if (!char || char.name === "Narrator") {
      const order = ["Daniel", "Google UK English Male", "Ryan", "Guy", "Mark", "David"];
      for (const n of order) {
        const v = allVoices.find(x => x.name.toLowerCase().includes(n.toLowerCase()));
        if (v) return v;
      }
      return allVoices[0];
    }

    // Effective gender (override > detected)
    const override = (profile?.genderOverride || "").toLowerCase();
    const detectedGender = (char.gender || "").toLowerCase();
    const gender = override === "auto" || !override ? detectedGender : override;

    const accent = (char.accent || "").toLowerCase();
    const wantsBritish = accent.includes("british") || accent.includes("english") || accent.includes("uk");

    // Build candidate list
    const britishMale = allVoices.filter(v => voiceAccentLabel(v) === "British" && inferVoiceGender(v) === "male");
    const britishFemale = allVoices.filter(v => voiceAccentLabel(v) === "British" && inferVoiceGender(v) === "female");
    const americanMale = allVoices.filter(v => voiceAccentLabel(v) === "American" && inferVoiceGender(v) === "male");
    const americanFemale = allVoices.filter(v => voiceAccentLabel(v) === "American" && inferVoiceGender(v) === "female");

    let candidates: SpeechSynthesisVoice[] = [];
    if (gender === "female") {
      candidates = wantsBritish
        ? [...britishFemale, ...americanFemale]
        : [...americanFemale, ...britishFemale];
    } else if (gender === "male") {
      candidates = wantsBritish
        ? [...britishMale, ...americanMale]
        : [...americanMale, ...britishMale];
    } else {
      candidates = wantsBritish
        ? [...britishMale, ...britishFemale, ...americanMale, ...americanFemale]
        : allVoices;
    }
    if (candidates.length === 0) candidates = allVoices;

    const idx = Math.abs(char.id) % candidates.length;
    return candidates[idx] || allVoices[0];
  }, [allVoices, profileMap]);

  // Compute final pitch/rate for a character (override > derived)
  const computeVoiceParams = useCallback((char: Character | null | undefined) => {
    const defaults = deriveDefaultsFromCharacter(char);
    const profile = char ? profileMap.get(char.id) : undefined;

    const pitch = profile?.pitch && profile.pitch !== 1.0 ? profile.pitch : defaults.pitch;
    const rate = profile?.rate && profile.rate !== 1.0 ? profile.rate : defaults.rate;
    const crispness = typeof profile?.crispness === "number" ? profile.crispness : defaults.crispness;

    // Age preset can override pitch/rate
    let p = pitch;
    let r = rate;
    const ageP = profile?.agePreset;
    if (ageP === "younger") { p *= 1.06; r *= 1.03; }
    else if (ageP === "older") { p *= 0.92; r *= 0.88; }

    const adjusted = applyCrispness({ pitch: p, rate: r }, crispness);
    return {
      pitch: Math.max(0.1, Math.min(2.0, adjusted.pitch)),
      rate: Math.max(0.1, Math.min(3.0, adjusted.rate * playbackSpeed)),
    };
  }, [profileMap, playbackSpeed]);

  // ---------------------------------------------------------------------------
  // Speak segment (Web Speech OR Premium TTS)
  // ---------------------------------------------------------------------------

  const speakSegment = useCallback(async (index: number) => {
    if (index >= segments.length) {
      setIsPlaying(false);
      return;
    }
    window.speechSynthesis.cancel();
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    const seg = segments[index];
    const char = charMap.get(seg.characterId ?? 0);
    const profile = char ? profileMap.get(char.id) : undefined;
    const params = computeVoiceParams(char);

    const advance = () => {
      const next = index + 1;
      if (next < segments.length) {
        setCurrentSegmentIndex(next);
        speakSegment(next);
      } else {
        setIsPlaying(false);
      }
    };

    // Premium path
    if (premiumActive && profile?.premiumVoiceId) {
      try {
        const r = await apiRequest("POST", "/api/premium/tts", {
          text: seg.text,
          voiceId: profile.premiumVoiceId,
          pitch: params.pitch,
          rate: params.rate / playbackSpeed,
        });
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        previewAudioRef.current = audio;
        audio.volume = isMuted ? 0 : volume;
        audio.playbackRate = playbackSpeed;
        audio.onended = () => { URL.revokeObjectURL(url); advance(); };
        audio.onerror = () => { URL.revokeObjectURL(url); setIsPlaying(false); };
        await audio.play();
        return;
      } catch (e) {
        console.warn("Premium TTS failed, falling back to browser voices:", e);
        // fall through to web speech
      }
    }

    // Web Speech path
    const utterance = new SpeechSynthesisUtterance(seg.text);
    const voice = getVoiceForCharacter(char);
    if (voice) utterance.voice = voice;
    utterance.pitch = params.pitch;
    utterance.rate = params.rate;
    utterance.volume = isMuted ? 0 : volume;
    utterance.onend = advance;
    utterance.onerror = () => setIsPlaying(false);
    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [segments, charMap, profileMap, computeVoiceParams, getVoiceForCharacter, volume, isMuted, playbackSpeed, premiumActive]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      if (previewAudioRef.current) previewAudioRef.current.pause();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      speakSegment(currentSegmentIndex);
    }
  }, [isPlaying, currentSegmentIndex, speakSegment]);

  const skipForward = () => {
    const next = Math.min(currentSegmentIndex + 1, segments.length - 1);
    window.speechSynthesis.cancel();
    if (previewAudioRef.current) previewAudioRef.current.pause();
    setCurrentSegmentIndex(next);
    if (isPlaying) speakSegment(next);
  };

  const skipBack = () => {
    const prev = Math.max(currentSegmentIndex - 1, 0);
    window.speechSynthesis.cancel();
    if (previewAudioRef.current) previewAudioRef.current.pause();
    setCurrentSegmentIndex(prev);
    if (isPlaying) speakSegment(prev);
  };

  const jumpToSegment = (index: number) => {
    window.speechSynthesis.cancel();
    if (previewAudioRef.current) previewAudioRef.current.pause();
    setCurrentSegmentIndex(index);
    if (isPlaying) speakSegment(index);
  };

  useEffect(() => {
    const el = document.getElementById(`segment-${currentSegmentIndex}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [currentSegmentIndex]);

  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
      if (previewAudioRef.current) previewAudioRef.current.pause();
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (e.code === "Space") { e.preventDefault(); togglePlay(); }
      if (e.code === "ArrowRight") skipForward();
      if (e.code === "ArrowLeft") skipBack();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay]);

  const progress = segments.length > 0 ? ((currentSegmentIndex + 1) / segments.length) * 100 : 0;

  const speakingCharacters = characters.filter(c => c.name !== "Narrator");
  const narrator = characters.find(c => c.name === "Narrator");

  if (!book) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background flex flex-col" data-testid="reader-page">
        {/* Top bar */}
        <header className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/library">
              <button className="p-1.5 rounded-md hover:bg-accent transition-colors" data-testid="button-back">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div>
              <h1 className="font-semibold text-sm leading-tight">{book.title}</h1>
              <p className="text-xs text-muted-foreground">{book.author}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {premiumActive && (
              <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
                <Sparkles className="w-3 h-3" /> Premium voices
              </Badge>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(true)}
              data-testid="button-settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <Button
              variant={showCharPanel ? "default" : "outline"}
              size="sm"
              onClick={() => setShowCharPanel(!showCharPanel)}
              data-testid="button-characters"
            >
              <Users className="w-4 h-4 mr-2" />
              Characters ({speakingCharacters.length})
            </Button>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Main two-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Reading area */}
          <div className="flex-1 overflow-hidden">
            <ScrollArea className="h-[calc(100vh-180px)]" ref={scrollRef}>
              <div className="max-w-3xl mx-auto px-6 py-8 space-y-1">
                {segments.map((seg, idx) => {
                  const char = charMap.get(seg.characterId ?? 0);
                  const isActive = idx === currentSegmentIndex;
                  const isDialogue = seg.isDialogue;
                  return (
                    <div
                      key={seg.id}
                      id={`segment-${idx}`}
                      className={`group relative py-1.5 px-3 rounded-lg cursor-pointer transition-all ${
                        isActive
                          ? "bg-primary/10 border border-primary/20"
                          : "hover:bg-accent/50 border border-transparent"
                      }`}
                      onClick={() => jumpToSegment(idx)}
                      data-testid={`segment-${idx}`}
                    >
                      {isDialogue && char && char.name !== "Narrator" && (
                        <div className="flex items-center gap-1.5 mb-1">
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ${isActive && isPlaying ? "character-pulse relative" : ""}`}
                            style={{ backgroundColor: char.colorTag || "#6366f1" }}
                          />
                          <span className="text-xs font-medium" style={{ color: char.colorTag || "#6366f1" }}>
                            {char.name}
                          </span>
                          {isActive && seg.emotionalContext !== "neutral" && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                              {seg.emotionalContext}
                            </Badge>
                          )}
                        </div>
                      )}
                      <p className={`text-sm leading-relaxed ${
                        isDialogue ? "font-medium" : "text-muted-foreground"
                      } ${isActive ? "text-foreground" : ""}`}>
                        {isDialogue && char && char.name !== "Narrator" ? `"${seg.text}"` : seg.text}
                      </p>
                      {isActive && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-primary" />
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Character side panel */}
          {showCharPanel && (
            <aside className="w-[360px] border-l border-border/50 bg-card/30 backdrop-blur-sm shrink-0 hidden lg:flex flex-col">
              <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic2 className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Characters & Voices</span>
                </div>
                <button
                  onClick={() => setShowCharPanel(false)}
                  className="p-1 rounded hover:bg-accent transition-colors"
                  aria-label="Close panel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {narrator && (
                    <CharacterRow
                      character={narrator}
                      profile={profileMap.get(narrator.id)}
                      isActive={currentCharacter?.id === narrator.id}
                      isExpanded={editingCharacterId === narrator.id}
                      onToggle={() => setEditingCharacterId(editingCharacterId === narrator.id ? null : narrator.id)}
                      allVoices={allVoices}
                      voicesByGroup={voicesByGroup}
                      premiumActive={premiumActive}
                      premiumVoices={premiumVoices}
                      premiumProvider={settings?.premiumProvider || null}
                      onSave={(updates) => saveProfile.mutate({ characterId: narrator.id, updates })}
                    />
                  )}
                  <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider pt-3 pb-1 px-1">
                    Speaking Characters ({speakingCharacters.length})
                  </div>
                  {speakingCharacters.map(char => (
                    <CharacterRow
                      key={char.id}
                      character={char}
                      profile={profileMap.get(char.id)}
                      isActive={currentCharacter?.id === char.id}
                      isExpanded={editingCharacterId === char.id}
                      onToggle={() => setEditingCharacterId(editingCharacterId === char.id ? null : char.id)}
                      allVoices={allVoices}
                      voicesByGroup={voicesByGroup}
                      premiumActive={premiumActive}
                      premiumVoices={premiumVoices}
                      premiumProvider={settings?.premiumProvider || null}
                      onSave={(updates) => saveProfile.mutate({ characterId: char.id, updates })}
                    />
                  ))}
                </div>
              </ScrollArea>
            </aside>
          )}
        </div>

        {/* Playback controls */}
        <div className="border-t border-border/50 bg-card/80 backdrop-blur-sm px-4 py-3 shrink-0">
          <div className="max-w-3xl mx-auto mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-10 text-right">{currentSegmentIndex + 1}</span>
              <div
                className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  const idx = Math.floor(pct * segments.length);
                  jumpToSegment(Math.max(0, Math.min(segments.length - 1, idx)));
                }}
              >
                <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <span className="text-xs text-muted-foreground w-10">{segments.length}</span>
            </div>
            {currentCharacter && (
              <div className="flex items-center gap-2 mt-2 justify-center">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: currentCharacter.colorTag || "#6366f1" }} />
                <span className="text-xs text-muted-foreground">
                  {currentCharacter.name === "Narrator" ? "Narrator" : `${currentCharacter.name} speaking`}
                  {currentSegment?.emotionalContext && currentSegment.emotionalContext !== "neutral" && (
                    <span className="text-primary ml-1">({currentSegment.emotionalContext})</span>
                  )}
                </span>
              </div>
            )}
          </div>

          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-2 rounded-lg hover:bg-accent transition-colors" onClick={() => setIsMuted(!isMuted)} data-testid="button-mute">
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
              </Tooltip>
              <div className="w-20">
                <Slider value={[volume * 100]} onValueChange={([v]) => setVolume(v / 100)} max={100} step={5} className="cursor-pointer" data-testid="slider-volume" />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-2 rounded-lg hover:bg-accent transition-colors" onClick={skipBack} data-testid="button-skip-back">
                    <SkipBack className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Previous (Left Arrow)</TooltipContent>
              </Tooltip>
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="p-2 rounded-lg hover:bg-accent transition-colors" onClick={skipForward} data-testid="button-skip-forward">
                    <SkipForward className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Next (Right Arrow)</TooltipContent>
              </Tooltip>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Speed:</span>
              <div className="flex gap-1">
                {[0.75, 1, 1.25, 1.5].map(speed => (
                  <button
                    key={speed}
                    onClick={() => setPlaybackSpeed(speed)}
                    className={`text-xs px-2 py-1 rounded ${
                      playbackSpeed === speed ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                    } transition-colors`}
                    data-testid={`button-speed-${speed}`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Settings dialog */}
        {showSettings && (
          <SettingsDialog
            settings={settings}
            onClose={() => setShowSettings(false)}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
              queryClient.invalidateQueries({ queryKey: ["/api/premium/voices"] });
            }}
          />
        )}
      </div>
    </TooltipProvider>
  );
}

// ===========================================================================
// CharacterRow — collapsed/expanded voice editor for one character
// ===========================================================================

interface CharacterRowProps {
  character: Character;
  profile: Partial<VoiceProfile> | undefined;
  isActive: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  allVoices: SpeechSynthesisVoice[];
  voicesByGroup: Record<string, SpeechSynthesisVoice[]>;
  premiumActive: boolean;
  premiumVoices: { id: string; name: string; gender?: string; accent?: string }[];
  premiumProvider: string | null;
  onSave: (updates: Partial<VoiceProfile>) => void;
}

function CharacterRow({
  character, profile, isActive, isExpanded, onToggle,
  allVoices, voicesByGroup, premiumActive, premiumVoices, premiumProvider, onSave,
}: CharacterRowProps) {
  const isNarrator = character.name === "Narrator";
  const defaults = deriveDefaultsFromCharacter(character);

  // Local editing state, hydrated from profile or defaults
  const [voiceUri, setVoiceUri] = useState<string>(profile?.selectedVoiceUri || "");
  const [premiumVoiceId, setPremiumVoiceId] = useState<string>(profile?.premiumVoiceId || "");
  const [pitch, setPitch] = useState<number>(typeof profile?.pitch === "number" && profile.pitch !== 1.0 ? profile.pitch : defaults.pitch);
  const [rate, setRate] = useState<number>(typeof profile?.rate === "number" && profile.rate !== 1.0 ? profile.rate : defaults.rate);
  const [crispness, setCrispness] = useState<number>(typeof profile?.crispness === "number" ? profile.crispness : defaults.crispness);
  const [agePreset, setAgePreset] = useState<string>(profile?.agePreset || defaults.agePreset);
  const [genderOverride, setGenderOverride] = useState<string>(profile?.genderOverride || "auto");

  // Re-sync when profile changes externally
  useEffect(() => {
    setVoiceUri(profile?.selectedVoiceUri || "");
    setPremiumVoiceId(profile?.premiumVoiceId || "");
    setPitch(typeof profile?.pitch === "number" && profile.pitch !== 1.0 ? profile.pitch : defaults.pitch);
    setRate(typeof profile?.rate === "number" && profile.rate !== 1.0 ? profile.rate : defaults.rate);
    setCrispness(typeof profile?.crispness === "number" ? profile.crispness : defaults.crispness);
    setAgePreset(profile?.agePreset || defaults.agePreset);
    setGenderOverride(profile?.genderOverride || "auto");
  }, [profile?.id]);

  const previewLine = isNarrator
    ? "This is how the narrator will sound while reading the descriptive parts of the book."
    : `Hello, my name is ${character.name}. This is how I will sound when I speak.`;

  const playPreview = async () => {
    window.speechSynthesis.cancel();

    // Premium preview if a premium voice is selected
    if (premiumActive && premiumVoiceId) {
      try {
        const r = await apiRequest("POST", "/api/premium/tts", {
          text: previewLine, voiceId: premiumVoiceId, pitch, rate,
        });
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
        return;
      } catch (e) {
        console.warn("Premium preview failed:", e);
      }
    }

    // Web Speech preview
    const u = new SpeechSynthesisUtterance(previewLine);
    if (voiceUri) {
      const v = allVoices.find(x => x.voiceURI === voiceUri);
      if (v) u.voice = v;
    } else {
      // No explicit choice → use auto-pick logic (gender + accent)
      const detectedGender = (character.gender || "").toLowerCase();
      const gender = genderOverride === "auto" || !genderOverride ? detectedGender : genderOverride;
      const accent = (character.accent || "").toLowerCase();
      const wantsBritish = accent.includes("british") || accent.includes("english") || accent.includes("uk");
      const matches = allVoices.filter(v => {
        const vg = inferVoiceGender(v);
        const va = voiceAccentLabel(v);
        return (gender ? vg === gender : true) && (wantsBritish ? va === "British" : true);
      });
      if (matches.length > 0) u.voice = matches[Math.abs(character.id) % matches.length];
      else if (allVoices[0]) u.voice = allVoices[0];
    }

    let p = pitch;
    let r = rate;
    if (agePreset === "younger") { p *= 1.06; r *= 1.03; }
    else if (agePreset === "older") { p *= 0.92; r *= 0.88; }
    const adj = applyCrispness({ pitch: p, rate: r }, crispness);
    u.pitch = Math.max(0.1, Math.min(2.0, adj.pitch));
    u.rate = Math.max(0.1, Math.min(3.0, adj.rate));
    u.volume = 1.0;
    window.speechSynthesis.speak(u);
  };

  const save = () => {
    onSave({
      selectedVoiceUri: voiceUri || null,
      selectedVoiceName: voiceUri ? (allVoices.find(v => v.voiceURI === voiceUri)?.name || null) : null,
      premiumVoiceId: premiumVoiceId || null,
      premiumProvider: premiumVoiceId ? premiumProvider : null,
      pitch,
      rate,
      crispness,
      agePreset,
      genderOverride,
    } as any);
  };

  const reset = () => {
    setVoiceUri("");
    setPremiumVoiceId("");
    setPitch(defaults.pitch);
    setRate(defaults.rate);
    setCrispness(defaults.crispness);
    setAgePreset(defaults.agePreset);
    setGenderOverride("auto");
    onSave({
      selectedVoiceUri: null,
      selectedVoiceName: null,
      premiumVoiceId: null,
      premiumProvider: null,
      pitch: 1.0,
      rate: 1.0,
      crispness: 0.5,
      agePreset: null,
      genderOverride: null,
    } as any);
  };

  // Auto-save on any change after a short debounce
  const saveTimer = useRef<any>(null);
  const queueSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 400);
  };
  useEffect(() => {
    if (!isExpanded) return;
    queueSave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceUri, premiumVoiceId, pitch, rate, crispness, agePreset, genderOverride]);

  return (
    <div className={`rounded-lg border transition-colors ${isActive ? "border-primary/50 bg-primary/5" : "border-border bg-card"}`}>
      {/* Collapsed header */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-accent/30 rounded-lg transition-colors"
        data-testid={`character-row-${character.id}`}
      >
        <div
          className={`w-3 h-3 rounded-full shrink-0 ${isActive ? "character-pulse relative" : ""}`}
          style={{ backgroundColor: character.colorTag || "#64748b" }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{character.name}</span>
            {character.isWellKnown && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5">Known</Badge>
            )}
            {(profile?.selectedVoiceName || profile?.premiumVoiceId) && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-primary/40 text-primary">
                Custom
              </Badge>
            )}
          </div>
          {!isNarrator && (
            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
              {character.gender && <span>{character.gender}</span>}
              {character.age && <span>· {character.age}</span>}
              {character.accent && <span>· {character.accent}</span>}
            </div>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {isExpanded ? "−" : "+"}
        </span>
      </button>

      {/* Expanded editor */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/40 pt-3">
          {!isNarrator && character.description && (
            <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
              {character.description}
            </p>
          )}

          {/* Voice picker */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Voice
            </label>
            <Select value={voiceUri || "auto"} onValueChange={(v) => { setVoiceUri(v === "auto" ? "" : v); setPremiumVoiceId(""); }}>
              <SelectTrigger className="h-8 text-xs" data-testid={`select-voice-${character.id}`}>
                <SelectValue placeholder="Auto (smart pick)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (smart pick)</SelectItem>
                {Object.entries(voicesByGroup).map(([group, voices]) =>
                  voices.length > 0 && (
                    <div key={group}>
                      <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                        {group}
                      </div>
                      {voices.map(v => (
                        <SelectItem key={v.voiceURI} value={v.voiceURI}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </div>
                  )
                )}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              {allVoices.length} browser {allVoices.length === 1 ? "voice" : "voices"} available
              {allVoices.length < 10 && ". Tip: Chrome desktop offers the most voices."}
            </p>
          </div>

          {/* Premium voice picker */}
          {premiumActive && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-primary uppercase tracking-wide flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Premium voice
              </label>
              <Select
                value={premiumVoiceId || "none"}
                onValueChange={(v) => { setPremiumVoiceId(v === "none" ? "" : v); if (v !== "none") setVoiceUri(""); }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (use browser voice above)</SelectItem>
                  {premiumVoices.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}{v.gender ? ` · ${v.gender}` : ""}{v.accent ? ` · ${v.accent}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Premium audio is generated using your own API key. Costs are billed by your provider.
              </p>
            </div>
          )}

          {/* Gender override */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Gender (safety override)
            </label>
            <div className="flex gap-1">
              {["auto", "male", "female"].map(g => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGenderOverride(g)}
                  className={`flex-1 text-[11px] py-1 rounded border transition-colors capitalize ${
                    genderOverride === g
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Age preset */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              Age feel
            </label>
            <div className="flex gap-1">
              {["younger", "adult", "older"].map(a => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAgePreset(a)}
                  className={`flex-1 text-[11px] py-1 rounded border transition-colors capitalize ${
                    agePreset === a
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border hover:bg-accent"
                  }`}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Pitch */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Pitch (deeper ↔ lighter)
              </label>
              <span className="text-[10px] text-muted-foreground tabular-nums">{pitch.toFixed(2)}</span>
            </div>
            <Slider
              value={[pitch * 100]}
              min={50}
              max={200}
              step={2}
              onValueChange={([v]) => setPitch(v / 100)}
            />
          </div>

          {/* Rate */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Speed (slow ↔ fast)
              </label>
              <span className="text-[10px] text-muted-foreground tabular-nums">{rate.toFixed(2)}</span>
            </div>
            <Slider
              value={[rate * 100]}
              min={50}
              max={200}
              step={2}
              onValueChange={([v]) => setRate(v / 100)}
            />
          </div>

          {/* Crispness */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Crispness (calm ↔ crisp)
              </label>
              <span className="text-[10px] text-muted-foreground tabular-nums">{(crispness * 100).toFixed(0)}%</span>
            </div>
            <Slider
              value={[crispness * 100]}
              min={0}
              max={100}
              step={2}
              onValueChange={([v]) => setCrispness(v / 100)}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" variant="default" onClick={playPreview} className="flex-1 h-8 text-xs gap-1.5">
              <Play className="w-3 h-3" /> Preview
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={reset} className="h-8 px-2">
                  <RotateCcw className="w-3 h-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset to defaults</TooltipContent>
            </Tooltip>
          </div>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// SettingsDialog — premium TTS BYOK config
// ===========================================================================

interface SettingsDialogProps {
  settings: { premiumProvider: string | null; premiumEnabled: boolean; hasApiKey: boolean } | undefined;
  onClose: () => void;
  onSaved: () => void;
}

function SettingsDialog({ settings, onClose, onSaved }: SettingsDialogProps) {
  const { toast } = useToast();
  const [provider, setProvider] = useState<string>(settings?.premiumProvider || "elevenlabs");
  const [apiKey, setApiKey] = useState<string>("");
  const [enabled, setEnabled] = useState<boolean>(!!settings?.premiumEnabled);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const body: any = { premiumProvider: provider, premiumEnabled: enabled };
      if (apiKey) body.premiumApiKey = apiKey;
      await apiRequest("POST", "/api/settings", body);
      toast({ title: "Settings saved" });
      onSaved();
      onClose();
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const clearKey = async () => {
    await apiRequest("POST", "/api/settings/clear-key");
    toast({ title: "API key cleared" });
    onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-card border border-border rounded-xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-base">Premium voice provider</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Bring your own API key for studio-quality voices
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-[11px] text-muted-foreground bg-muted/50 border border-border/50 rounded-md p-3 leading-relaxed">
            CharacterVoice supports multiple premium voice providers via a Bring-Your-Own-Key model.
            Your key is sent only to the provider you select. CharacterVoice is not affiliated with,
            endorsed by, or reselling any third-party voice service. You are responsible for usage
            costs charged by your provider.
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Provider</label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="elevenlabs">Provider A (Studio voices)</SelectItem>
                <SelectItem value="openai">Provider B (Versatile voices)</SelectItem>
                <SelectItem value="google">Provider C (Cloud TTS)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              {provider === "elevenlabs" && "Compatible with ElevenLabs API. Get a key at elevenlabs.io."}
              {provider === "openai" && "Compatible with OpenAI TTS API. Get a key at platform.openai.com."}
              {provider === "google" && "Compatible with Google Cloud Text-to-Speech. Get a key at console.cloud.google.com."}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              API key {settings?.hasApiKey && <span className="text-primary normal-case ml-1">(saved)</span>}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={settings?.hasApiKey ? "Leave blank to keep existing key" : "Paste your API key here"}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="text-[10px] text-muted-foreground">
              Stored on your CharacterVoice instance only. Never logged or shared.
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm">Enable premium voices for this app</span>
          </label>
        </div>

        <div className="p-5 border-t border-border flex items-center justify-between gap-2">
          {settings?.hasApiKey ? (
            <Button variant="outline" size="sm" onClick={clearKey} className="text-destructive">
              Clear saved key
            </Button>
          ) : <div />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
