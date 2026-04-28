import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/ThemeProvider";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Sun, Moon, Crown, Sparkles, Gift, Zap, ExternalLink, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

interface UserSettings {
  tier: string;
  subscriptionStatus: string | null;
  subscriptionRenewsAt: string | null;
  email: string | null;
}

export default function AccountPage() {
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [portalLoading, setPortalLoading] = useState(false);

  const { data: settings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
    queryFn: () => apiRequest("GET", "/api/settings").then(r => r.json()),
  });

  // Show success toast when returning from successful checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split("?")[1] || "");
    if (params.get("success") === "1") {
      toast({
        title: "Welcome aboard ❤",
        description: "Your subscription is active. Premium voices are unlocked.",
      });
    }
  }, [toast]);

  const tier = settings?.tier || "free";

  const tierConfig: Record<string, { name: string; icon: React.ReactNode; color: string; description: string }> = {
    free: { name: "Free", icon: <Gift className="w-5 h-5" />, color: "text-muted-foreground", description: "Browser voices, full character editor" },
    plus: { name: "Plus", icon: <Sparkles className="w-5 h-5" />, color: "text-primary", description: "Bring-your-own premium voices" },
    pro: { name: "Pro", icon: <Crown className="w-5 h-5" />, color: "text-primary", description: "Premium voices included" },
    lifetime: { name: "Lifetime · Founding Member", icon: <Zap className="w-5 h-5" />, color: "text-primary", description: "All Pro features forever" },
  };
  const current = tierConfig[tier];

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const r = await apiRequest("POST", "/api/billing/portal");
      const data = await r.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error(data.error || "Could not open portal");
      }
    } catch (e: any) {
      toast({ title: "Could not open billing portal", description: e.message, variant: "destructive" });
      setPortalLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="account-page">
      {/* Header */}
      <header className="border-b border-border/50">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/library">
            <button className="flex items-center gap-2 text-sm hover:text-primary transition-colors">
              <ArrowLeft className="w-4 h-4" />
              <span className="font-medium">Back to library</span>
            </button>
          </Link>
          <button onClick={toggleTheme} className="p-2 rounded-lg hover:bg-accent">
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">My account</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your subscription and billing.
          </p>
        </div>

        {/* Current plan */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center ${current.color}`}>
                {current.icon}
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Current plan</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <h2 className="text-xl font-bold">{current.name}</h2>
                  {settings?.subscriptionStatus === "active" && (
                    <Badge variant="outline" className="gap-1 border-green-500/40 text-green-600 dark:text-green-400">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{current.description}</p>
              </div>
            </div>
          </div>

          {settings?.email && (
            <div className="mt-5 pt-5 border-t border-border/50 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Billing email</span>
              <span className="font-medium">{settings.email}</span>
            </div>
          )}

          {settings?.subscriptionRenewsAt && tier !== "lifetime" && tier !== "free" && (
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                {settings.subscriptionStatus === "canceled" ? "Access ends" : "Next renewal"}
              </span>
              <span className="font-medium">
                {new Date(settings.subscriptionRenewsAt).toLocaleDateString()}
              </span>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            {tier === "free" ? (
              <Button onClick={() => setLocation("/pricing")}>Upgrade plan</Button>
            ) : tier === "lifetime" ? (
              <Button variant="outline" disabled>You own this forever ❤</Button>
            ) : (
              <>
                <Button variant="outline" onClick={openPortal} disabled={portalLoading} className="gap-2">
                  {portalLoading ? "Opening..." : "Manage subscription"}
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" onClick={() => setLocation("/pricing")}>Change plan</Button>
              </>
            )}
          </div>
        </div>

        {/* Patent / about */}
        <div className="rounded-2xl border border-border/50 bg-muted/30 p-6">
          <h3 className="text-sm font-semibold mb-2">About CharacterVoice</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Patent-pending technology under US Provisional Patent Application <strong>64/044,893</strong>,
            filed April 20, 2026. Built by Adolfo Castillo-Martinez.
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-2">
            CharacterVoice is not affiliated with, endorsed by, or reselling any third-party voice service.
            Premium voices are routed through your own provider account when you supply an API key.
          </p>
        </div>

        {/* Support */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="text-sm font-semibold mb-2">Need help?</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Email <a href="mailto:martinez.adolf94@gmail.com" className="text-primary hover:underline">martinez.adolf94@gmail.com</a> for support, feedback, or partnership inquiries.
          </p>
        </div>
      </div>
    </div>
  );
}
