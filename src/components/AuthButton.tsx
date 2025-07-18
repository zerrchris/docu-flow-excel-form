import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { User, LogIn, LogOut } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const AuthButton: React.FC = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
          const { data: { session } } = await supabase.auth.getSession();
          setUser(session?.user ?? null);
          
          const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
          });

          return () => subscription.unsubscribe();
        }
      } catch (error) {
        console.warn('Auth initialization failed:', error);
      } finally {
        setLoading(false);
      }
    };

    initAuth();
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

  if (loading) {
    return <Button variant="outline" disabled>Loading...</Button>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">
          {user.email}
        </span>
        <Button variant="outline" size="sm" onClick={handleSignOut}>
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
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