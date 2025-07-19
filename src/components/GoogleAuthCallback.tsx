import { useEffect } from 'react';

const GoogleAuthCallback = () => {
  useEffect(() => {
    console.log('GoogleAuthCallback mounted');
    console.log('Current URL:', window.location.href);
    
    // Extract the authorization code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');
    
    console.log('Auth code:', code);
    console.log('Auth error:', error);

    if (code) {
      console.log('Sending success message to parent');
      // Send success message to parent window
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
          type: 'GOOGLE_AUTH_SUCCESS',
          code: code
        }, window.location.origin);
        
        // Close the popup after a short delay to ensure message is sent
        setTimeout(() => {
          window.close();
        }, 500);
      } else {
        console.log('No opener window found');
        // Fallback: save to localStorage and close
        localStorage.setItem('google_auth_code', code);
        window.close();
      }
    } else if (error) {
      console.log('Sending error message to parent');
      // Send error message to parent window
      if (window.opener && !window.opener.closed) {
        window.opener.postMessage({
          type: 'GOOGLE_AUTH_ERROR',
          error: error
        }, window.location.origin);
        
        setTimeout(() => {
          window.close();
        }, 500);
      } else {
        console.log('No opener window found for error');
        window.close();
      }
    } else {
      console.log('No code or error found in URL');
    }
  }, []);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-lg font-semibold mb-2">Completing Google Authentication...</h2>
        <p className="text-muted-foreground">This window will close automatically.</p>
        <p className="text-xs text-muted-foreground mt-2">
          If this window doesn't close automatically, you can close it manually.
        </p>
      </div>
    </div>
  );
};

export default GoogleAuthCallback;
