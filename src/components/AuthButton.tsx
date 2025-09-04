import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { User, LogIn, LogOut, Shield, KeyRound, ChevronDown, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const AuthButton: React.FC = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const { toast } = useToast();
  const { manageSubscription } = useSubscription();

  useEffect(() => {
    let mounted = true;

    const initAuth = async () => {
      try {
        // Set up auth state listener FIRST
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
          if (!mounted) return;
          
          setUser(session?.user ?? null);
          setLoading(false); // Clear loading when auth state changes
          
          // Defer admin check to avoid deadlock
          if (session?.user) {
            setTimeout(() => {
              if (!mounted) return;
              checkAdminStatus(session.user.id);
            }, 0);
          } else {
            setIsAdmin(false);
          }
        });
        
        // THEN check for existing session
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;
        
        setUser(session?.user ?? null);
        setLoading(false); // Clear loading after getting session
        
        if (session?.user) {
          checkAdminStatus(session.user.id);
        }
        
        return () => {
          mounted = false;
          subscription.unsubscribe();
        };
      } catch (error) {
        console.warn('Auth initialization failed:', error);
        if (mounted) {
          setLoading(false); // Always clear loading on error
        }
      }
    };

    const checkAdminStatus = async (userId: string) => {
      try {
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('role', 'admin')
          .maybeSingle();
        
        if (mounted) {
          setIsAdmin(!!roleData);
        }
      } catch (error) {
        console.warn('Failed to check admin status:', error);
        if (mounted) {
          setIsAdmin(false);
        }
      }
    };

    initAuth();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({
        title: "Error signing out",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    
    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Password Reset Email Sent",
        description: "Check your email for a password reset link.",
      });
    }
  };

  if (loading) {
    return <Button variant="outline" disabled>Loading...</Button>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {user.email}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <User className="h-4 w-4 mr-2" />
              Account
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-background border z-50">
            {isAdmin && (
              <DropdownMenuItem asChild>
                <Link to="/admin" className="flex items-center w-full">
                  <Shield className="h-4 w-4 mr-2" />
                  Admin Panel
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={manageSubscription}>
              <CreditCard className="h-4 w-4 mr-2" />
              Manage Subscription
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleChangePassword}>
              <KeyRound className="h-4 w-4 mr-2" />
              Change Password
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <Link to="/signin">
      <Button variant="outline" size="sm">
        <LogIn className="h-4 w-4 mr-2" />
        Sign In
      </Button>
    </Link>
  );
};

export default AuthButton;