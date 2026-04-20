import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/components/ThemeProvider";
import type { Book, Character, DialogueSegment, VoiceProfile } from "@shared/schema";
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Headphones, Sun, Moon, ArrowLeft, Users, BookOpen,
  Mic2, Settings, ChevronLeft, ChevronRight, Info
} from "lucide-react";

export default function ReaderPage() {
  const params = useParams<{ id: string }>();
  const bookId = Number(params.id);
  const { theme, toggleTheme } = useTheme();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [volume, setVolume] = useState(1.0);
  const [isMuted, setIsMuted] = useState(false);
  const [showCharPanel, setShowCharPanel] = useState(false);

  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
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

  const charMap = new Map(characters.map(c => [c.id, c]));
  const currentSegment = segments[currentSegmentIndex];
  const currentCharacter = currentSegment ? charMap.get(currentSegment.characterId ?? 0) : null;

  // Get available voices
  const getVoiceForCharacter = useCallback((char: Character | null | undefined): SpeechSynthesisVoice | null => {
    const voices = window.speechSynthesis.getVoices();
    if (voices.length === 0) return null;

    // Try to match voice characteristics
    if (char) {
      const gender = char.gender?.toLowerCase();
      const isEnglish = (v: SpeechSynthesisVoice) => v.lang.startsWith("en");
      const englishVoices = voices.filter(isEnglish);

      if (englishVoices.length > 0) {
        // Use character ID to consistently pick the same voice
        const idx = char.id % englishVoices.length;
        return englishVoices[idx];
      }
    }

    return voices[0] || null;
  }, []);

  // Apply voice profile to utterance
  const applyVoiceProfile = useCallback((utterance: SpeechSynthesisUtterance, char: Character | null | undefined) => {
    const voice = getVoiceForCharacter(char);
    if (voice) utterance.voice = voice;

    // Apply character-specific settings
    if (char?.name === "Narrator") {
      utterance.pitch = 1.0;
      utterance.rate = 0.95 * playbackSpeed;
    } else if (char) {
      // Map character traits to speech parameters
      const age = char.age?.toLowerCase();
      const gender = char.gender?.toLowerCase();
      const tone = char.voiceTone?.toLowerCase() || "";

      let pitch = 1.0;
      let rate = 1.0;

      // Age-based pitch
      if (age === "elderly") { pitch = 0.8; rate = 0.85; }
      else if (age === "young") { pitch = 1.15; rate = 1.05; }

      // Gender-based pitch
      if (gender === "female") pitch *= 1.1;
      else if (gender === "male") pitch *= 0.9;

      // Tone adjustments
      if (tone.includes("deep")) pitch *= 0.85;
      if (tone.includes("high") || tone.includes("bright")) pitch *= 1.1;
      if (tone.includes("rapid") || tone.includes("brisk")) rate *= 1.1;
      if (tone.includes("slow") || tone.includes("measured")) rate *= 0.9;

      utterance.pitch = Math.max(0.1, Math.min(2.0, pitch));
      utterance.rate = Math.max(0.1, Math.min(3.0, rate * playbackSpeed));
    } else {
      utterance.pitch = 1.0;
      utterance.rate = playbackSpeed;
    }

    utterance.volume = isMuted ? 0 : volume;
  }, [getVoiceForCharacter, playbackSpeed, volume, isMuted]);

  // Speak a segment
  const speakSegment = useCallback((index: number) => {
    if (index >= segments.length) {
      setIsPlaying(false);
      return;
    }

    window.speechSynthesis.cancel();

    const seg = segments[index];
    const char = charMap.get(seg.characterId ?? 0);
    const utterance = new SpeechSynthesisUtterance(seg.text);

    applyVoiceProfile(utterance, char);

    utterance.onend = () => {
      const next = index + 1;
      if (next < segments.length) {
        setCurrentSegmentIndex(next);
        speakSegment(next);
      } else {
        setIsPlaying(false);
      }
    };

    utterance.onerror = () => {
      setIsPlaying(false);
    };

    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [segments, charMap, applyVoiceProfile]);

  // Play/pause
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
    } else {
      setIsPlaying(true);
      speakSegment(currentSegmentIndex);
    }
  }, [isPlaying, currentSegmentIndex, speakSegment]);

  // Skip forward/back
  const skipForward = () => {
    const next = Math.min(currentSegmentIndex + 1, segments.length - 1);
    window.speechSynthesis.cancel();
    setCurrentSegmentIndex(next);
    if (isPlaying) speakSegment(next);
  };

  const skipBack = () => {
    const prev = Math.max(currentSegmentIndex - 1, 0);
    window.speechSynthesis.cancel();
    setCurrentSegmentIndex(prev);
    if (isPlaying) speakSegment(prev);
  };

  // Jump to segment
  const jumpToSegment = (index: number) => {
    window.speechSynthesis.cancel();
    setCurrentSegmentIndex(index);
    if (isPlaying) speakSegment(index);
  };

  // Scroll active segment into view
  useEffect(() => {
    const el = document.getElementById(`segment-${currentSegmentIndex}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentSegmentIndex]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // Load voices
  useEffect(() => {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.getVoices();
    };
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Space" && !e.target?.toString().includes("Input")) {
        e.preventDefault();
        togglePlay();
      }
      if (e.code === "ArrowRight") skipForward();
      if (e.code === "ArrowLeft") skipBack();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [togglePlay]);

  const progress = segments.length > 0 ? ((currentSegmentIndex + 1) / segments.length) * 100 : 0;

  // Group characters (excluding narrator)
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
            <Sheet open={showCharPanel} onOpenChange={setShowCharPanel}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm" data-testid="button-characters">
                  <Users className="w-4 h-4 mr-2" />
                  Characters ({speakingCharacters.length})
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[340px] sm:w-[400px]">
                <SheetHeader>
                  <SheetTitle className="flex items-center gap-2">
                    <Mic2 className="w-4 h-4 text-primary" />
                    Character Voice DNA
                  </SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-3">
                  {narrator && (
                    <CharacterVoiceCard character={narrator} isActive={currentCharacter?.id === narrator.id} />
                  )}
                  <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider pt-2">
                    Characters ({speakingCharacters.length})
                  </div>
                  {speakingCharacters.map(char => (
                    <CharacterVoiceCard
                      key={char.id}
                      character={char}
                      isActive={currentCharacter?.id === char.id}
                    />
                  ))}
                </div>
              </SheetContent>
            </Sheet>
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Text display area */}
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
                    {/* Character indicator */}
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
                      isDialogue
                        ? "font-medium"
                        : "text-muted-foreground"
                    } ${isActive ? "text-foreground" : ""}`}>
                      {isDialogue && char && char.name !== "Narrator" ? `"${seg.text}"` : seg.text}
                    </p>

                    {/* Active indicator line */}
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-full bg-primary" />
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Playback controls */}
        <div className="border-t border-border/50 bg-card/80 backdrop-blur-sm px-4 py-3 shrink-0">
          {/* Progress bar */}
          <div className="max-w-3xl mx-auto mb-3">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-10 text-right">
                {currentSegmentIndex + 1}
              </span>
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = (e.clientX - rect.left) / rect.width;
                  const idx = Math.floor(pct * segments.length);
                  jumpToSegment(Math.max(0, Math.min(segments.length - 1, idx)));
                }}
              >
                <div
                  className="h-full bg-primary rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground w-10">
                {segments.length}
              </span>
            </div>
            {/* Currently speaking character */}
            {currentCharacter && (
              <div className="flex items-center gap-2 mt-2 justify-center">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: currentCharacter.colorTag || "#6366f1" }}
                />
                <span className="text-xs text-muted-foreground">
                  {currentCharacter.name === "Narrator" ? "Narrator" : `${currentCharacter.name} speaking`}
                  {currentSegment?.emotionalContext && currentSegment.emotionalContext !== "neutral" && (
                    <span className="text-primary ml-1">({currentSegment.emotionalContext})</span>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="max-w-3xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="p-2 rounded-lg hover:bg-accent transition-colors"
                    onClick={() => setIsMuted(!isMuted)}
                    data-testid="button-mute"
                  >
                    {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                  </button>
                </TooltipTrigger>
                <TooltipContent>{isMuted ? "Unmute" : "Mute"}</TooltipContent>
              </Tooltip>
              <div className="w-20">
                <Slider
                  value={[volume * 100]}
                  onValueChange={([v]) => setVolume(v / 100)}
                  max={100}
                  step={5}
                  className="cursor-pointer"
                  data-testid="slider-volume"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="p-2 rounded-lg hover:bg-accent transition-colors"
                    onClick={skipBack}
                    data-testid="button-skip-back"
                  >
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
                  <button
                    className="p-2 rounded-lg hover:bg-accent transition-colors"
                    onClick={skipForward}
                    data-testid="button-skip-forward"
                  >
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
                      playbackSpeed === speed
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent"
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
      </div>
    </TooltipProvider>
  );
}

function CharacterVoiceCard({ character, isActive }: { character: Character; isActive: boolean }) {
  const isNarrator = character.name === "Narrator";

  return (
    <div className={`rounded-lg border p-3 transition-colors ${
      isActive ? "border-primary/40 bg-primary/5" : "border-border"
    }`}>
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-3 h-3 rounded-full ${isActive ? "character-pulse relative" : ""}`}
          style={{ backgroundColor: character.colorTag || "#64748b" }}
        />
        <span className="font-medium text-sm">{character.name}</span>
        {character.isWellKnown && (
          <Badge variant="outline" className="text-[10px] h-4">Known</Badge>
        )}
        {isActive && (
          <Badge className="text-[10px] h-4 ml-auto">Speaking</Badge>
        )}
      </div>

      {!isNarrator && (
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {character.description && (
            <p className="line-clamp-2">{character.description}</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1">
            {character.age && (
              <span>Age: <span className="text-foreground">{character.age}</span></span>
            )}
            {character.gender && (
              <span>Gender: <span className="text-foreground">{character.gender}</span></span>
            )}
            {character.accent && (
              <span>Accent: <span className="text-foreground">{character.accent}</span></span>
            )}
          </div>
          {character.voiceTone && (
            <div className="pt-1">
              <span className="text-primary text-[11px]">Voice: {character.voiceTone}</span>
            </div>
          )}
          {character.personality && (
            <div>
              <span className="text-[11px]">Traits: {character.personality}</span>
            </div>
          )}
          <div className="pt-1 text-[11px]">
            {character.dialogueCount} lines of dialogue
          </div>
        </div>
      )}

      {isNarrator && (
        <p className="text-xs text-muted-foreground">
          Calm, clear narration voice for non-dialogue text
        </p>
      )}
    </div>
  );
}
