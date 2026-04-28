import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BookOpen, Headphones, Mic2, Sparkles, Wand2, Upload, Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export default function HomePage() {
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const loadDemo = useMutation({
    mutationFn: () => apiRequest("POST", "/api/books/demo"),
    onSuccess: async (res) => {
      const book = await res.json();
      navigate(`/reader/${book.id}`);
    },
    onError: () => {
      toast({ title: "Error loading demo", variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen bg-background" data-testid="home-page">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <Headphones className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg tracking-tight">CharacterVoice</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-primary/70 ml-1 mt-1">Patent Pending</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg hover:bg-accent transition-colors"
            data-testid="theme-toggle"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <Link href="/pricing">
            <Button variant="ghost" size="sm">Pricing</Button>
          </Link>
          <Link href="/library">
            <Button variant="outline" size="sm" data-testid="link-library">
              <BookOpen className="w-4 h-4 mr-2" />
              My Library
            </Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          AI-Powered Character Voice Matching
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 leading-tight">
          Books that sound like<br />
          <span className="text-primary">the characters inside them</span>
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
          CharacterVoice uses AI to read your books aloud with voices that match each character.
          Sherlock Holmes sounds sharp and analytical. Elizabeth Bennet sounds witty and spirited.
          Every character gets a voice that fits who they are.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            size="lg"
            className="text-base px-6"
            onClick={() => loadDemo.mutate()}
            disabled={loadDemo.isPending}
            data-testid="button-try-demo"
          >
            {loadDemo.isPending ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                Loading demo...
              </span>
            ) : (
              <>
                <Wand2 className="w-4 h-4 mr-2" />
                Try the Demo
              </>
            )}
          </Button>
          <Link href="/library">
            <Button size="lg" variant="outline" className="text-base px-6" data-testid="button-upload-book">
              <Upload className="w-4 h-4 mr-2" />
              Upload a Book
            </Button>
          </Link>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <h2 className="text-center text-sm font-medium text-muted-foreground uppercase tracking-wider mb-10">
          How It Works
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          <FeatureCard
            icon={<Upload className="w-5 h-5" />}
            title="Upload Your Book"
            description="Drop in any book text. The app parses chapters and identifies every line of dialogue."
            step="1"
          />
          <FeatureCard
            icon={<Mic2 className="w-5 h-5" />}
            title="Character Voice DNA"
            description="AI analyzes each character — their age, personality, accent, and identity — to build a unique voice profile that matches who they are."
            step="2"
          />
          <FeatureCard
            icon={<Headphones className="w-5 h-5" />}
            title="Listen with Character Voices"
            description="Press play and hear the book come alive. Each character speaks with their own matched voice. Mr. Darcy sounds like Mr. Darcy."
            step="3"
          />
        </div>
      </section>

      {/* Character showcase */}
      <section className="max-w-4xl mx-auto px-6 pb-20">
        <div className="rounded-2xl border border-border bg-card p-8">
          <h3 className="font-semibold text-lg mb-6 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Character Voice DNA Preview
          </h3>
          <div className="grid sm:grid-cols-2 gap-4">
            <CharacterPreview
              name="Sherlock Holmes"
              traits="Sharp, analytical, British, intense"
              color="#8b5cf6"
              pitch="Medium"
              tone="Crisp, deductive"
            />
            <CharacterPreview
              name="Elizabeth Bennet"
              traits="Young, witty, spirited, British"
              color="#6366f1"
              pitch="Higher"
              tone="Lively, articulate"
            />
            <CharacterPreview
              name="Mr. Darcy"
              traits="Reserved, proud, refined, British"
              color="#ec4899"
              pitch="Low"
              tone="Measured, formal"
            />
            <CharacterPreview
              name="Captain Ahab"
              traits="Weathered, obsessive, commanding"
              color="#f59e0b"
              pitch="Low"
              tone="Gravelly, intense"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6 text-center text-sm text-muted-foreground">
        <div>CharacterVoice — AI Character-Matched Book Narration</div>
        <div className="mt-1 text-xs text-muted-foreground/60">Patent Pending — U.S. Provisional Application No. 64/044,893</div>
        <div className="mt-1 text-xs text-muted-foreground/60">Created by Adolfo.CM</div>
      </footer>
    </div>
  );
}

function FeatureCard({ icon, title, description, step }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  step: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 relative">
      <div className="absolute -top-3 -left-1 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
        {step}
      </div>
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function CharacterPreview({ name, traits, color, pitch, tone }: {
  name: string;
  traits: string;
  color: string;
  pitch: string;
  tone: string;
}) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-background/50 border border-border/50">
      <div
        className="w-3 h-3 rounded-full mt-1.5 shrink-0"
        style={{ backgroundColor: color }}
      />
      <div>
        <div className="font-medium text-sm">{name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{traits}</div>
        <div className="flex gap-3 mt-1.5 text-xs">
          <span className="text-primary">Pitch: {pitch}</span>
          <span className="text-muted-foreground">Tone: {tone}</span>
        </div>
      </div>
    </div>
  );
}
