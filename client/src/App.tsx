import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/ThemeProvider";
import HomePage from "@/pages/home";
import LibraryPage from "@/pages/library";
import ReaderPage from "@/pages/reader";
import NotFound from "@/pages/not-found";

function AppRouter() {
  return (
    <Router hook={useHashLocation}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/library" component={LibraryPage} />
        <Route path="/reader/:id" component={ReaderPage} />
        <Route component={NotFound} />
      </Switch>
    </Router>
  );
}

function App() {
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
