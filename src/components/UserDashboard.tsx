import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  User, 
  CreditCard, 
  Calendar, 
  Settings, 
  FileText, 
  Shield,
  CheckCircle,
  XCircle,
  Crown,
  Users
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useToast } from '@/hooks/use-toast';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
}

const UserDashboard: React.FC = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [loading, setLoading] = useState(true);
  const { subscribed, subscriptionTier, subscriptionEnd, manageSubscription } = useSubscription();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const loadUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session?.user) {
        navigate('/signin');
        return;
      }

      setUser(session.user);

      // Load user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();

      if (profileError) {
        console.error('Error loading profile:', profileError);
      } else {
        setProfile(profileData);
      }

      // Load user role
      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .single();

      if (roleError) {
        console.error('Error loading role:', roleError);
      } else {
        setUserRole(roleData.role);
      }

      setLoading(false);
    };

    loadUserData();
  }, [navigate]);

  const handleManageSubscription = async () => {
    try {
      await manageSubscription();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to open subscription management.",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back, {profile?.first_name || profile?.email}!
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Profile Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Profile</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold">
                {profile?.first_name && profile?.last_name 
                  ? `${profile.first_name} ${profile.last_name}`
                  : 'User Profile'
                }
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={userRole === 'admin' ? 'default' : 'secondary'}>
                  {userRole === 'admin' ? (
                    <>
                      <Crown className="h-3 w-3 mr-1" />
                      Admin
                    </>
                  ) : (
                    <>
                      <Users className="h-3 w-3 mr-1" />
                      User
                    </>
                  )}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Subscription Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Subscription</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {subscribed ? (
                <>
                  <Badge variant="default" className="gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {subscriptionTier || 'Active'}
                  </Badge>
                  {subscriptionEnd && (
                    <p className="text-xs text-muted-foreground">
                      Expires: {new Date(subscriptionEnd).toLocaleDateString()}
                    </p>
                  )}
                </>
              ) : (
                <Badge variant="secondary" className="gap-1">
                  <XCircle className="h-3 w-3" />
                  No Active Plan
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account Status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Member Since</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {profile?.created_at 
                ? new Date(profile.created_at).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short' 
                  })
                : 'N/A'
              }
            </div>
            <p className="text-xs text-muted-foreground">
              Account creation date
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>
              Get started with your most common tasks
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full" onClick={() => navigate('/app')}>
              Go to App
            </Button>
            <Button variant="outline" className="w-full" onClick={() => navigate('/document-processor')}>
              Process Documents
            </Button>
            {subscribed && (
              <Button variant="outline" className="w-full" onClick={handleManageSubscription}>
                Manage Subscription
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Subscription Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Subscription
            </CardTitle>
            <CardDescription>
              Manage your subscription and billing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {subscribed ? (
              <>
                <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg border border-green-200 dark:border-green-800">
                  <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                    Active Plan: {subscriptionTier}
                  </p>
                  {subscriptionEnd && (
                    <p className="text-xs text-green-600 dark:text-green-300">
                      Renews: {new Date(subscriptionEnd).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Button variant="outline" className="w-full" onClick={handleManageSubscription}>
                  Manage Subscription
                </Button>
              </>
            ) : (
              <>
                <div className="p-3 bg-orange-50 dark:bg-orange-950 rounded-lg border border-orange-200 dark:border-orange-800">
                  <p className="text-sm text-orange-800 dark:text-orange-200 font-medium">
                    No active subscription
                  </p>
                  <p className="text-xs text-orange-600 dark:text-orange-300">
                    Subscribe to unlock all features
                  </p>
                </div>
                <Button className="w-full" onClick={() => navigate('/pricing')}>
                  View Plans
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Admin Panel Access */}
        {userRole === 'admin' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Admin Panel
              </CardTitle>
              <CardDescription>
                Manage users and system settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                  Administrator Access
                </p>
                <p className="text-xs text-blue-600 dark:text-blue-300">
                  Manage users and subscriptions
                </p>
              </div>
              <Button variant="default" className="w-full" onClick={() => navigate('/admin')}>
                Open Admin Panel
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Account Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Account Settings
            </CardTitle>
            <CardDescription>
              Manage your account preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-1">
              <p><strong>Email:</strong> {user?.email}</p>
              <p><strong>Role:</strong> {userRole}</p>
            </div>
            <Button variant="outline" className="w-full" onClick={() => navigate('/settings')}>
              Account Settings
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default UserDashboard;