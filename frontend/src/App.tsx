import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { UiSoundProvider } from "@/audio/UiSoundProvider";

const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Books = lazy(() => import("./pages/Books"));
const BookDetail = lazy(() => import("./pages/BookDetail"));

const queryClient = new QueryClient();
const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

const RouteFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <Loader2 className="w-10 h-10 animate-spin" strokeWidth={3} />
  </div>
);

const RoutedApp = () => (
  <BrowserRouter>
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/books" element={<Books />} />
        <Route path="/books/:id" element={<BookDetail />} />
        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  </BrowserRouter>
);

const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <UiSoundProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          {googleClientId ? (
            <GoogleOAuthProvider clientId={googleClientId}>
              <RoutedApp />
            </GoogleOAuthProvider>
          ) : (
            <RoutedApp />
          )}
        </TooltipProvider>
      </UiSoundProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;
