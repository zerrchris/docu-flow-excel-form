import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const AuthStatus = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        const response = {
          authenticated: !!session,
          token: session?.access_token || null
        };

        // Return the auth status as JSON
        const urlParams = new URLSearchParams(window.location.search);
        const callback = urlParams.get('callback');
        
        if (callback) {
          // JSONP callback
          const script = document.createElement('script');
          script.textContent = `${callback}(${JSON.stringify(response)});`;
          document.head.appendChild(script);
        } else {
          // Regular JSON response (this won't work due to CORS, but kept for reference)
          console.log('Auth status:', response);
        }
      } catch (error) {
        console.error('Error checking auth status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  if (loading) {
    return <div>Checking authentication...</div>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-lg font-semibold mb-2">Authentication Status</h2>
        <p className="text-muted-foreground">This page is used by the browser extension to check authentication status.</p>
      </div>
    </div>
  );
};

export default AuthStatus;