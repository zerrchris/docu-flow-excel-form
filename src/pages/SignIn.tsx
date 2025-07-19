import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { LogIn, ArrowLeft } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import extractorLogo from '@/assets/document-extractor-logo.png';

const SignIn: React.FC = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchParams] = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(searchParams.get('mode') === 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const initAuth = async () => {
      try {
        console.log('Starting auth initialization...');
        console.log('Current URL:', window.location.href);
        console.log('Search params:', window.location.search);
        
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error('Session error:', sessionError);
          setLoading(false);
          return;
        }
        
        console.log('Current session:', session);
        setUser(session?.user ?? null);
        
        // Check if we're in a password reset flow
        const urlParams = new URLSearchParams(window.location.search);
        const isPasswordReset = urlParams.get('reset') === 'true';
        const tokenHash = urlParams.get('token_hash');
        const type = urlParams.get('type');
        
        console.log('URL params:', { isPasswordReset, tokenHash, type });
        
        // If this is a password reset link, redirect to reset password page
        if (tokenHash && type === 'recovery') {
          console.log('Redirecting to reset password page');
          navigate(`/reset-password?token_hash=${tokenHash}&type=${type}`);
          return;
        }
        
        // If user is already signed in and not in reset flow, redirect to home
        if (session?.user && !isPasswordReset) {
          console.log('User already signed in, redirecting to home');
          // Force immediate redirect
          window.location.href = '/';
          return;
        }
        
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          console.log('Auth state changed:', event, session);
          setUser(session?.user ?? null);
          
          // Only redirect on successful sign in, not during password reset flow
          if (session?.user && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && !isPasswordReset) {
            console.log('Successful sign in, redirecting to home');
            // Use setTimeout to ensure state updates are complete
            setTimeout(() => {
              window.location.href = '/';
            }, 100);
          }
        });

        // Store subscription for cleanup
        return () => {
          console.log('Cleaning up auth subscription');
          subscription.unsubscribe();
        };
      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        console.log('Auth initialization complete, setting loading to false');
        setLoading(false);
      }
    };

    // Add a timeout to ensure loading doesn't persist indefinitely
    const loadingTimeout = setTimeout(() => {
      console.log('Loading timeout reached, forcing loading to false');
      setLoading(false);
    }, 3000);

    initAuth().then(() => {
      clearTimeout(loadingTimeout);
    }).catch((error) => {
      console.error('InitAuth promise rejected:', error);
      clearTimeout(loadingTimeout);
      setLoading(false);
    });

    return () => {
      clearTimeout(loadingTimeout);
    };
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    console.log('Starting authentication process...', { isSignUp, email });

    try {
      if (isSignUp) {
        console.log('Attempting sign up...');
        const redirectUrl = `${window.location.origin}/`;
        
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl
          }
        });
        
        if (error) {
          console.error('Sign up error:', error);
          throw error;
        }
        
        console.log('Sign up successful');
        toast({
          title: "Check your email",
          description: "A confirmation link has been sent to your email address.",
        });
      } else {
        console.log('Attempting sign in...');
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        if (error) {
          console.error('Sign in error:', error);
          throw error;
        }
        
        console.log('Sign in successful:', data);
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
        
        // Force immediate redirect after successful sign in
        setTimeout(() => {
          window.location.href = '/';
        }, 100);
      }
      
      setEmail('');
      setPassword('');
    } catch (error: any) {
      console.error('Authentication failed:', error);
      toast({
        title: "Authentication failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      console.log('Setting authLoading to false');
      setAuthLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!resetEmail) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setAuthLoading(true);
    
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: redirectUrl,
      });
      
      if (error) throw error;
      
      setResetEmailSent(true);
      setDialogOpen(false);
      setResetEmail('');
      toast({
        title: "Reset email sent",
        description: "Check your email for a password reset link.",
      });
    } catch (error: any) {
      toast({
        title: "Error sending reset email",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <img 
            src={extractorLogo} 
            alt="RunsheetPro Logo" 
            className="h-16 w-16 mx-auto mb-4"
          />
          <p>Loading...</p>
        </div>
      </div>
    );
  }
  
  // If user is already signed in, show a different message
  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <img 
            src={extractorLogo} 
            alt="RunsheetPro Logo" 
            className="h-16 w-16 mx-auto mb-4"
          />
          <p className="mb-4">You're already signed in as {user.email}</p>
          <Link to="/">
            <Button>Go to App</Button>
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="p-6">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <Link to="/" className="flex items-center gap-4">
            <img 
              src={extractorLogo} 
              alt="RunsheetPro Logo" 
              className="h-12 w-12"
            />
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              RunsheetPro
            </h1>
          </Link>
          <Link to="/">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to App
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              {isSignUp ? 'Create Account' : 'Welcome Back'}
            </CardTitle>
            <CardDescription>
              {isSignUp 
                ? 'Create an account to save and manage your runsheets' 
                : ''
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAuth} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-3">
                <Button type="submit" className="w-full" disabled={authLoading}>
                  <LogIn className="h-4 w-4 mr-2" />
                  {authLoading ? 'Loading...' : (isSignUp ? 'Create Account' : 'Sign In')}
                </Button>
                
                {!isSignUp && (
                  <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full text-sm"
                        disabled={authLoading}
                      >
                        {resetEmailSent ? 'Reset email sent!' : 'Forgot password?'}
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Reset Password</DialogTitle>
                        <DialogDescription>
                          Enter your email address and we'll send you a link to reset your password.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label htmlFor="reset-email">Email</Label>
                          <Input
                            id="reset-email"
                            type="email"
                            placeholder="Enter your email"
                            value={resetEmail}
                            onChange={(e) => setResetEmail(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => setDialogOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            className="flex-1"
                            onClick={handleForgotPassword}
                            disabled={authLoading}
                          >
                            {authLoading ? 'Sending...' : 'Send Reset Link'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
                
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full"
                  onClick={() => {
                    console.log('Toggling isSignUp from', isSignUp, 'to', !isSignUp);
                    setIsSignUp(!isSignUp);
                    setResetEmailSent(false);
                  }}
                >
                  {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="p-6 text-center text-sm text-muted-foreground">
        <p>Secure authentication powered by Supabase</p>
      </div>
    </div>
  );
};

export default SignIn;