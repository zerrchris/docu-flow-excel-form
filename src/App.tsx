import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SubscriptionProvider } from "./contexts/SubscriptionContext";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import AppPage from "./pages/App";
import SignIn from "./pages/SignIn";
import ResetPassword from "./pages/ResetPassword";
import Admin from "./pages/Admin";
import Pricing from "./pages/Pricing";
import Success from "./pages/Success";
import { MobileCapture } from "./pages/MobileCapture";
import { FileManager } from "./pages/FileManager";
import NotFound from "./pages/NotFound";
import GoogleAuthCallback from "./components/GoogleAuthCallback";
import CapturePopupPage from "./pages/CapturePopup";
import AuthStatus from "./pages/AuthStatus";
import LeaseCheck from "./pages/LeaseCheck";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SubscriptionProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/app" element={<Dashboard />} />
            <Route path="/runsheet" element={<AppPage />} />
            <Route path="/signin" element={<SignIn />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/success" element={<Success />} />
            <Route path="/mobile-capture" element={<MobileCapture />} />
            <Route path="/file-manager" element={<FileManager />} />
            <Route path="/google-auth-callback" element={<GoogleAuthCallback />} />
            <Route path="/capture-popup" element={<CapturePopupPage />} />
            <Route path="/auth-status" element={<AuthStatus />} />
            <Route path="/lease-check" element={<LeaseCheck />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </SubscriptionProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
