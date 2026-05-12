import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "@/lib/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import HomePage from "@/pages/home";
import LibraryPage from "@/pages/library";
import ReaderPage from "@/pages/reader";
import PricingPage from "@/pages/pricing";
import AccountPage from "@/pages/account";
import NotFound from "@/pages/not-found";
import { useEffect } from "react";
import { App as CapApp } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { isNative } from "@/lib/platform";

function AppRouter() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/library" component={LibraryPage} />
        <Route path="/reader/:id" component={ReaderPage} />
        <Route path="/pricing" component={PricingPage} />
        <Route path="/account" component={AccountPage} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

function useDeepLinks() {
  useEffect(() => {
    if (!isNative()) return;
    const sub = CapApp.addListener("appUrlOpen", async (event) => {
      // event.url shape: charactervoice://billing/success?session_id=...
      //                  charactervoice://billing/cancel
      try {
        const url = new URL(event.url);
        // host is 'billing'; pathname is '/success' or '/cancel'
        if (url.host === "billing") {
          // Close the Stripe Custom Tab if it's still on top.
          try { await Browser.close(); } catch {}
          if (url.pathname.startsWith("/success")) {
            window.location.hash = "#/account?success=1";
          } else if (url.pathname.startsWith("/cancel")) {
            window.location.hash = "#/pricing?canceled=1";
          }
        }
      } catch (err) {
        console.warn("[deeplink] unable to parse", event.url, err);
      }
    });
    return () => {
      sub.then((s) => s.remove());
    };
  }, []);
}

function App() {
  useDeepLinks();
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppRouter />
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
