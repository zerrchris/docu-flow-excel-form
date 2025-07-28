import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Users, Shield, UserCheck, Settings, Home, CreditCard, Calendar, CheckCircle, XCircle } from 'lucide-react';
import extractorLogo from '@/assets/document-extractor-logo.png';
import AuthButton from '@/components/AuthButton';

import type { User as SupabaseUser } from '@supabase/supabase-js';

interface Profile {
  id: string;
  user_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  created_at: string;
}

interface UserRole {
  id: string;
  user_id: string;
  role: 'admin' | 'user';
}

interface UserWithRole extends Profile {
  role: 'admin' | 'user';
  subscription?: {
    subscribed: boolean;
    subscription_tier: string | null;
    subscription_end: string | null;
  };
}

const Admin: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithRole[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [globalInstructions, setGlobalInstructions] = useState('');
  const [isSavingInstructions, setIsSavingInstructions] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const loadUsersWithSubscriptions = async () => {
    try {
      // Get all subscriptions
      const { data: subscriptionsData, error: subscriptionsError } = await supabase.functions.invoke('admin-manage-subscription', {
        body: { action: 'get_all_subscriptions' }
      });

      if (subscriptionsError) throw subscriptionsError;

      const subscriptions = subscriptionsData.subscribers || [];
      
      // Get all profiles with their roles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Combine profiles with roles and subscriptions
      const usersWithRoles: UserWithRole[] = profiles?.map(profile => {
        const userRole = roles?.find(role => role.user_id === profile.user_id);
        const subscription = subscriptions.find((sub: any) => sub.user_id === profile.user_id);
        
        return {
          ...profile,
          role: userRole?.role || 'user',
          subscription: subscription ? {
            subscribed: subscription.subscribed,
            subscription_tier: subscription.subscription_tier,
            subscription_end: subscription.subscription_end
          } : undefined
        };
      }) || [];

      setUsers(usersWithRoles);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load users: " + error.message,
        variant: "destructive",
      });
    }
  };

  const grantFreeAccess = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-subscription', {
        body: { 
          action: 'grant_free_access',
          target_user_id: userId,
          subscription_data: {
            tier: 'Admin Granted',
            duration_days: 365
          }
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Free access granted for 1 year",
      });

      // Reload users to reflect changes
      await loadUsersWithSubscriptions();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to grant access: " + error.message,
        variant: "destructive",
      });
    }
  };

  const revokeAccess = async (userId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('admin-manage-subscription', {
        body: { 
          action: 'revoke_access',
          target_user_id: userId
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Access has been revoked",
      });

      // Reload users to reflect changes
      await loadUsersWithSubscriptions();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to revoke access: " + error.message,
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    // Check authentication and admin status
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate('/signin');
        return;
      }

      setCurrentUser(session.user);

      // Check if user is admin
      const { data: roleData, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', session.user.id)
        .eq('role', 'admin')
        .single();

      if (error || !roleData) {
        toast({
          title: "Access Denied",
          description: "You don't have admin privileges.",
          variant: "destructive",
        });
        navigate('/');
        return;
      }

      setIsAdmin(true);
      await loadUsersWithSubscriptions();
      await loadGlobalInstructions();
      setLoading(false);
    };

    checkAuth();
  }, [navigate, toast]);

  const loadGlobalInstructions = async () => {
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', 'global_extraction_instructions')
        .maybeSingle();

      if (error) {
        console.error('Error loading global instructions:', error);
        return;
      }

      if (data) {
        setGlobalInstructions(data.setting_value);
      }
    } catch (error: any) {
      console.error('Error loading global instructions:', error);
    }
  };

  const saveGlobalInstructions = async () => {
    setIsSavingInstructions(true);
    try {
      // First try to update existing record
      const { data, error } = await supabase
        .from('admin_settings')
        .update({ 
          setting_value: globalInstructions,
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', 'global_extraction_instructions')
        .select();

      if (error) throw error;

      toast({
        title: "Success",
        description: "Global extraction instructions have been saved.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to save global instructions: " + error.message,
        variant: "destructive",
      });
    } finally {
      setIsSavingInstructions(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: 'admin' | 'user') => {
    try {
      // First, delete any existing roles for this user
      const { error: deleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (deleteError) throw deleteError;

      // Then insert the new role
      const { error: insertError } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role: newRole });

      if (insertError) throw insertError;

      // Update local state
      setUsers(users.map(user => 
        user.user_id === userId ? { ...user, role: newRole } : user
      ));

      toast({
        title: "Success",
        description: `User role updated to ${newRole}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to update user role: " + error.message,
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading admin panel...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null; // Will redirect in useEffect
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b w-full">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
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
            <div className="flex items-center gap-4">
              <Button
                variant="default"
                size="sm"
                onClick={() => navigate('/app')}
                className="gap-2"
              >
                <Home className="h-4 w-4" />
                Dashboard
              </Button>
              
              <AuthButton />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">

        {/* Page Title */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-primary" />
            <h2 className="text-3xl font-bold">Admin Panel</h2>
          </div>
          <p className="text-muted-foreground">Manage users, subscriptions, and permissions</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{users.length}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Admins</CardTitle>
              <Shield className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter(user => user.role === 'admin').length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Subscribed Users</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter(user => user.subscription?.subscribed).length}
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Regular Users</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {users.filter(user => user.role === 'user').length}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Global Extraction Instructions */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Global Extraction Instructions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="global-instructions" className="text-sm font-medium">
                  Instructions for AI Document Analysis
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  These instructions will be included with every document extraction request to improve accuracy and consistency.
                </p>
                <Textarea
                  id="global-instructions"
                  value={globalInstructions}
                  onChange={(e) => setGlobalInstructions(e.target.value)}
                  className="min-h-[120px]"
                  placeholder="Enter detailed instructions for how the AI should extract data from documents..."
                />
              </div>
              <Button 
                onClick={saveGlobalInstructions}
                disabled={isSavingInstructions}
                className="w-full sm:w-auto"
              >
                {isSavingInstructions ? 'Saving...' : 'Save Instructions'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <CardTitle>User Management & Subscription Control</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Subscription</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      {user.first_name || user.last_name 
                        ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                        : 'N/A'
                      }
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        {user.subscription?.subscribed ? (
                          <>
                            <Badge variant="default" className="gap-1 w-fit">
                              <CheckCircle className="h-3 w-3" />
                              {user.subscription.subscription_tier}
                            </Badge>
                            {user.subscription.subscription_end && (
                              <span className="text-xs text-muted-foreground">
                                Until {new Date(user.subscription.subscription_end).toLocaleDateString()}
                              </span>
                            )}
                          </>
                        ) : (
                          <Badge variant="secondary" className="gap-1 w-fit">
                            <XCircle className="h-3 w-3" />
                            No Access
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(user.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-2">
                        {/* Role Management */}
                        {currentUser?.id !== user.user_id && (
                          <Select
                            value={user.role}
                            onValueChange={(value: 'admin' | 'user') => 
                              updateUserRole(user.user_id, value)
                            }
                          >
                            <SelectTrigger className="w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        {currentUser?.id === user.user_id && (
                          <span className="text-sm text-muted-foreground">You</span>
                        )}
                        
                        {/* Subscription Management */}
                        {currentUser?.id !== user.user_id && (
                          <div className="flex gap-1">
                            {!user.subscription?.subscribed ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => grantFreeAccess(user.user_id)}
                                className="text-xs gap-1"
                              >
                                <CheckCircle className="h-3 w-3" />
                                Grant Access
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => revokeAccess(user.user_id)}
                                className="text-xs gap-1"
                              >
                                <XCircle className="h-3 w-3" />
                                Revoke
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Admin;