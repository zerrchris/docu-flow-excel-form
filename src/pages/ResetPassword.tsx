import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Key } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import extractorLogo from '@/assets/document-extractor-logo.png';

const ResetPassword: React.FC = () => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [tokenHash, setTokenHash] = useState<string>('');
  const [isValidToken, setIsValidToken] = useState<boolean | null>(null);
  const [email, setEmail] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const verifyResetToken = async () => {
      console.log('ResetPassword page loaded');
      console.log('Current URL:', window.location.href);
      console.log('Search params:', window.location.search);
      
      // Check if we have the required tokens in the URL
      const urlTokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type');
      
      console.log('Reset password page loaded with params:', { urlTokenHash, type });
      
      if (!urlTokenHash || type !== 'recovery') {
        console.log('Missing or invalid parameters');
        setIsValidToken(false);
        return;
      }

      // Store the token hash
      setTokenHash(urlTokenHash);
      
      try {
        // Verify the token without consuming it by checking session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Error getting session:', error);
          setIsValidToken(false);
          return;
        }
        
        // If we have a session, the token might have been consumed elsewhere
        // Let's attempt a verification to check token validity
        console.log('Attempting to verify token validity...');
        
        // We'll set as valid for now and handle errors during password update
        setIsValidToken(true);
        
      } catch (error) {
        console.error('Error verifying token:', error);
        setIsValidToken(false);
      }
    };

    verifyResetToken();
  }, [searchParams]);

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are the same.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      console.log('Attempting to verify OTP and update password');
      
      // First verify the OTP token
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery'
      });

      if (verifyError) {
        console.error('Error verifying OTP:', verifyError);
        throw verifyError;
      }

      console.log('OTP verified, now updating password');

      // Now update the password
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        console.error('Error updating password:', updateError);
        throw updateError;
      }

      toast({
        title: "Password updated",
        description: "Your password has been successfully updated.",
      });

      // Redirect to sign in page
      navigate('/signin');
    } catch (error: any) {
      console.error('Password reset error:', error);
      toast({
        title: "Error updating password",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestNewLink = async () => {
    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      
      if (error) throw error;
      
      setResetEmailSent(true);
      toast({
        title: "New reset link sent",
        description: "Check your email for a new password reset link.",
      });
    } catch (error: any) {
      toast({
        title: "Error sending reset email",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

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
          <Link to="/signin">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Sign In
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl flex items-center justify-center gap-2">
              <Key className="h-6 w-6" />
              {isValidToken === false ? 'Reset Link Expired' : 'Reset Password'}
            </CardTitle>
            <CardDescription>
              {isValidToken === false 
                ? 'This password reset link has expired or is invalid' 
                : 'Enter your new password below'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isValidToken === null ? (
              // Loading state
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                <p>Verifying reset link...</p>
              </div>
            ) : isValidToken === false ? (
              // Invalid/expired token - show request new link form
              <div className="space-y-4">
                <div className="text-center space-y-2 mb-6">
                  <p className="text-sm text-muted-foreground">
                    Password reset links expire after a certain time for security reasons.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Please request a new reset link below:
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                
                <Button 
                  onClick={handleRequestNewLink} 
                  className="w-full" 
                  disabled={loading || resetEmailSent}
                >
                  {loading ? 'Sending...' : resetEmailSent ? 'Reset Link Sent!' : 'Send New Reset Link'}
                </Button>
                
                {resetEmailSent && (
                  <div className="text-center text-sm text-muted-foreground mt-4">
                    <p>Check your email for a new password reset link.</p>
                  </div>
                )}
              </div>
            ) : (
              // Valid token - show password reset form
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your new password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  <Key className="h-4 w-4 mr-2" />
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            )}
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

export default ResetPassword;