import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';

const AuthStatus = () => {
  const [loading, setLoading] = useState(true);
  const [authData, setAuthData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = {
        authenticated: !!session,
        token: session?.access_token || null,
        user: session?.user || null,
        expiresAt: session?.expires_at || null
      };

      setAuthData(response);

      // Return the auth status as JSON for extension
      const urlParams = new URLSearchParams(window.location.search);
      const callback = urlParams.get('callback');
      
      if (callback) {
        // JSONP callback for extension
        const script = document.createElement('script');
        script.textContent = `${callback}(${JSON.stringify(response)});`;
        document.head.appendChild(script);
      }

      // Make auth data globally available for extension testing
      (window as any).authStatus = response;
      
    } catch (error) {
      console.error('Error checking auth status:', error);
      setError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
    
    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkAuth();
    });

    return () => subscription.unsubscribe();
  }, []);

  const refreshAuth = () => {
    checkAuth();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center p-8">
            <div className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span>Checking authentication...</span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                {authData?.authenticated ? (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-500" />
                )}
                Authentication Status
              </CardTitle>
              <CardDescription>
                This page provides authentication status for the browser extension
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={refreshAuth}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-200">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-red-700 font-medium">Error</span>
              </div>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">Status</label>
              <div>
                <Badge variant={authData?.authenticated ? "default" : "destructive"}>
                  {authData?.authenticated ? "Authenticated" : "Not Authenticated"}
                </Badge>
              </div>
            </div>

            {authData?.user && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">User Email</label>
                  <p className="text-sm">{authData.user.email}</p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">User ID</label>
                  <p className="text-sm font-mono text-xs">{authData.user.id}</p>
                </div>

                {authData.expiresAt && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-muted-foreground">Token Expires</label>
                    <p className="text-sm">{new Date(authData.expiresAt * 1000).toLocaleString()}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {authData?.authenticated && (
            <div className="p-4 rounded-lg bg-green-50 border border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <span className="text-green-700 font-medium">Extension Ready</span>
              </div>
              <p className="text-green-600 text-sm mt-1">
                The browser extension can now access your account and sync data with your runsheets.
              </p>
            </div>
          )}

          {!authData?.authenticated && (
            <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-yellow-500" />
                <span className="text-yellow-700 font-medium">Sign In Required</span>
              </div>
              <p className="text-yellow-600 text-sm mt-1">
                Please sign in to use the browser extension features.
              </p>
              <Button 
                className="mt-3" 
                size="sm"
                onClick={() => window.location.href = '/signin'}
              >
                Go to Sign In
              </Button>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            <p><strong>For Extension Developers:</strong></p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li>Use JSONP callback parameter for cross-origin requests</li>
              <li>Authentication data is available at window.authStatus</li>
              <li>Page auto-refreshes on auth state changes</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AuthStatus;