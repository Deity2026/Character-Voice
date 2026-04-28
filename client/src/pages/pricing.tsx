import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Check, Sun, Moon, Sparkles, Crown, Zap, Gift } from "lucide-react";
import { useState } from "react";

interface BillingPlans {
  stripeConfigured: boolean;
  plans: Record<string, { priceId: string | null; amount: number; interval: string; tier: string }>;
}

interface UserSettings {
  tier: string;
  email: string | null;
}

export default function PricingPage() {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const { data: plans } = useQuery<BillingPlans>({
    queryKey: ["/api/billing/plans"],
    queryFn: () => apiRequest("GET", "/api/billing/plans").then(r => r.json()),
  });

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
    queryFn: () => apiRequest("GET", "/api/settings").then(r => r.json()),
  });

  const currentTier = settings?.tier || "free";

  const handleCheckout = async (plan: string) => {
    if (!plans?.stripeConfigured) {
      toast({
        title: "Coming soon",
        description: "Payments will be enabled shortly. Check back in a few minutes.",
      });
      return;
    }
    setLoading(plan);
    try {
      const r = await apiRequest("POST", "/api/billing/checkout", {
        plan,
        email: settings?.email || undefined,
      });
      const data = await r.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Could not start checkout");
      }
    } catch (e: any) {
      toast({ title: "Checkout failed", description: e.message, variant: "destructive" });
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="pricing-page">
      {/* Header */}
      <header className="border-b border-border/50 sticky top-0 bg-background/80 backdrop-blur-sm z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/library">
            <button className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="font-medium">Back to library</span>
            </button>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/account">
              <Button variant="ghost" size="sm">My Account</Button>
            </Link>
            <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-accent">
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-16 pb-10 text-center">
        <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
          <Sparkles className="w-3 h-3" />
          Patent-pending technology · App #64/044,893
        </Badge>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
          Bring every character to life
        </h1>
        <p className="text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
          CharacterVoice automatically detects every speaker in your book and gives them their own
          unique voice. Free forever for browser voices. Upgrade to unlock studio-quality narration.
        </p>
      </section>

      {/* Pricing grid */}
      <section className="max-w-6xl mx-auto px-6 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Free */}
          <PlanCard
            name="Free"
            price="$0"
            period="forever"
            icon={<Gift className="w-5 h-5" />}
            description="Everything you need to start enjoying books with character voices."
            features={[
              "Unlimited books",
              "Auto character detection",
              "Per-character voice editor",
              "All browser voices",
              "Pitch / speed / age controls",
              "Reading progress saved",
            ]}
            cta={currentTier === "free" ? "Current plan" : "Switch to Free"}
            ctaDisabled={currentTier === "free"}
            onClick={() => {}}
            highlight={false}
          />

          {/* Plus */}
          <PlanCard
            name="Plus"
            price="$4.99"
            period="per month"
            icon={<Sparkles className="w-5 h-5" />}
            description="Connect your own studio voices for hyper-realistic narration."
            features={[
              "Everything in Free",
              "Bring-your-own premium voices",
              "ElevenLabs / OpenAI / Google",
              "Unlimited premium playback",
              "Export character voices to MP3",
              "Priority email support",
            ]}
            cta={currentTier === "plus" ? "Current plan" : "Upgrade to Plus"}
            ctaDisabled={currentTier === "plus"}
            onClick={() => handleCheckout("plus_monthly")}
            loading={loading === "plus_monthly"}
            highlight={false}
          />

          {/* Pro - highlighted */}
          <PlanCard
            name="Pro"
            price="$9.99"
            period="per month"
            yearlyPrice="$79/yr · save 34%"
            icon={<Crown className="w-5 h-5" />}
            description="Premium voices included. No API keys. Just open and listen."
            features={[
              "Everything in Plus",
              "Premium voices included (no key needed)",
              "Up to 30 min/day of premium audio",
              "Cloud sync across devices",
              "Unlimited MP3 exports",
              "Early access to new features",
            ]}
            cta={currentTier === "pro" ? "Current plan" : "Upgrade to Pro"}
            ctaDisabled={currentTier === "pro"}
            onClick={() => handleCheckout("pro_monthly")}
            loading={loading === "pro_monthly"}
            secondaryCta="Or yearly · $79"
            secondaryOnClick={() => handleCheckout("pro_yearly")}
            secondaryLoading={loading === "pro_yearly"}
            highlight={true}
          />

          {/* Lifetime */}
          <PlanCard
            name="Lifetime"
            price="$149"
            period="one-time"
            icon={<Zap className="w-5 h-5" />}
            description="Pay once, own it forever. Best deal for early adopters."
            features={[
              "Everything in Pro · forever",
              "No recurring charges",
              "All future features included",
              "Founding member badge",
              "Direct line to founder for feedback",
              "Limited to first 100 customers",
            ]}
            cta={currentTier === "lifetime" ? "You're a founding member ❤" : "Get Lifetime"}
            ctaDisabled={currentTier === "lifetime"}
            onClick={() => handleCheckout("lifetime")}
            loading={loading === "lifetime"}
            highlight={false}
            ribbon="Founder pricing"
          />
        </div>

        {/* FAQ */}
        <div className="max-w-3xl mx-auto mt-20 space-y-6">
          <h2 className="text-2xl font-bold text-center mb-8">Frequently asked</h2>
          <Faq
            q="Is the free tier really free?"
            a="Yes. Forever. The free tier uses voices already built into your browser, so it costs us nothing to operate. You get unlimited books, full character detection, and the complete voice editor."
          />
          <Faq
            q="What's the difference between Plus and Pro?"
            a="Plus uses your own API key with a premium provider — you pay them directly for usage. Pro includes premium voices for you (we cover ~30 min/day of high-quality TTS) so there's nothing to set up."
          />
          <Faq
            q="Can I cancel anytime?"
            a="Yes. Subscriptions cancel instantly through your account page. You keep premium access until the end of the billing period."
          />
          <Faq
            q="Is my reading data private?"
            a="Yes. Your books, your voice settings, and your API keys live on your CharacterVoice instance only. We don't sell data or train models on your content."
          />
          <Faq
            q="What about the patent?"
            a="The character-aware voice synthesis approach is protected by US Provisional Application 64/044,893 (filed April 20, 2026). Pro and Lifetime members get attribution as founding supporters of the technology."
          />
        </div>

        {/* Trust line */}
        <div className="text-center mt-16 text-xs text-muted-foreground">
          Payments processed securely by Stripe. Refunds available within 14 days.
          <br />
          CharacterVoice is not affiliated with, endorsed by, or reselling any third-party voice service.
        </div>
      </section>
    </div>
  );
}

interface PlanCardProps {
  name: string;
  price: string;
  period: string;
  yearlyPrice?: string;
  icon: React.ReactNode;
  description: string;
  features: string[];
  cta: string;
  ctaDisabled?: boolean;
  onClick: () => void;
  loading?: boolean;
  secondaryCta?: string;
  secondaryOnClick?: () => void;
  secondaryLoading?: boolean;
  highlight: boolean;
  ribbon?: string;
}

function PlanCard(props: PlanCardProps) {
  return (
    <div
      className={`relative rounded-2xl border p-5 flex flex-col transition-all ${
        props.highlight
          ? "border-primary bg-primary/5 shadow-lg scale-[1.02]"
          : "border-border bg-card hover:border-primary/30"
      }`}
      data-testid={`plan-${props.name.toLowerCase()}`}
    >
      {props.highlight && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground border-0">
          Most popular
        </Badge>
      )}
      {props.ribbon && (
        <Badge variant="outline" className="absolute -top-3 right-4 bg-background border-primary/40 text-primary">
          {props.ribbon}
        </Badge>
      )}

      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${
        props.highlight ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"
      }`}>
        {props.icon}
      </div>

      <h3 className="text-lg font-bold">{props.name}</h3>
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-3xl font-bold tracking-tight">{props.price}</span>
        <span className="text-xs text-muted-foreground">/ {props.period}</span>
      </div>
      {props.yearlyPrice && (
        <div className="text-[11px] text-primary mt-0.5">{props.yearlyPrice}</div>
      )}

      <p className="text-xs text-muted-foreground mt-3 leading-relaxed min-h-[36px]">
        {props.description}
      </p>

      <ul className="mt-4 space-y-2 flex-1">
        {props.features.map((f, i) => (
          <li key={i} className="flex items-start gap-2 text-xs">
            <Check className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
            <span className="leading-snug">{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 space-y-2">
        <Button
          className="w-full"
          variant={props.highlight ? "default" : "outline"}
          disabled={props.ctaDisabled || props.loading}
          onClick={props.onClick}
          data-testid={`button-${props.name.toLowerCase()}`}
        >
          {props.loading ? "Redirecting..." : props.cta}
        </Button>
        {props.secondaryCta && (
          <button
            onClick={props.secondaryOnClick}
            disabled={props.secondaryLoading}
            className="w-full text-[11px] text-muted-foreground hover:text-primary underline-offset-2 hover:underline transition-colors"
          >
            {props.secondaryLoading ? "Redirecting..." : props.secondaryCta}
          </button>
        )}
      </div>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border border-border rounded-lg p-4 hover:border-primary/30 transition-colors">
      <summary className="font-semibold text-sm cursor-pointer flex items-center justify-between gap-4">
        <span>{q}</span>
        <span className="text-muted-foreground group-open:rotate-45 transition-transform">+</span>
      </summary>
      <p className="text-sm text-muted-foreground mt-3 leading-relaxed">{a}</p>
    </details>
  );
}
