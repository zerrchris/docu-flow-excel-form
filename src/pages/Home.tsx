import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LogIn, FileText, Save, FolderOpen, Users, Shield, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import extractorLogo from '@/assets/document-extractor-logo.png';

const Home: React.FC = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img 
                src={extractorLogo} 
                alt="RunsheetPro Logo" 
                className="h-12 w-12"
              />
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                RunsheetPro
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {loading ? (
                <Button disabled>Loading...</Button>
              ) : user ? (
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">Welcome, {user.email}</span>
                  <Link to="/app">
                    <Button>Open App</Button>
                  </Link>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link to="/signin">
                    <Button variant="outline">
                      <LogIn className="h-4 w-4 mr-2" />
                      Sign In
                    </Button>
                  </Link>
                  <Link to="/app">
                    <Button>Try Now</Button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <h2 className="text-5xl font-bold tracking-tight mb-6">
            Document Data Extraction
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Transform your document processing workflow with RunsheetPro. Extract data from documents, 
            organize it in customizable spreadsheets, and save your work securely in the cloud.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <Link to="/app">
                <Button size="lg" className="gap-2">
                  <FileText className="h-5 w-5" />
                  Open App
                </Button>
              </Link>
            ) : (
              <>
                <Link to="/app">
                  <Button size="lg" className="gap-2">
                    <FileText className="h-5 w-5" />
                    Try for Free
                  </Button>
                </Link>
                <Link to="/signin">
                  <Button size="lg" variant="outline" className="gap-2">
                    <LogIn className="h-5 w-5" />
                    Sign In
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 px-4 bg-muted/50">
        <div className="container mx-auto max-w-6xl">
          <h3 className="text-3xl font-bold text-center mb-12">
            Everything you need for document processing
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            <Card>
              <CardHeader className="text-center">
                <FileText className="h-12 w-12 mx-auto text-primary mb-4" />
                <CardTitle>Document Analysis</CardTitle>
                <CardDescription>
                  Upload documents and extract key data automatically with AI-powered analysis
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="text-center">
                <Save className="h-12 w-12 mx-auto text-primary mb-4" />
                <CardTitle>Cloud Storage</CardTitle>
                <CardDescription>
                  Save your runsheets securely in the cloud and access them from anywhere
                </CardDescription>
              </CardHeader>
            </Card>
            
            <Card>
              <CardHeader className="text-center">
                <FolderOpen className="h-12 w-12 mx-auto text-primary mb-4" />
                <CardTitle>Easy Management</CardTitle>
                <CardDescription>
                  Organize, edit, and manage your data with powerful spreadsheet tools
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h3 className="text-3xl font-bold mb-6">
                Why choose RunsheetPro?
              </h3>
              <div className="space-y-6">
                <div className="flex gap-4">
                  <Zap className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold mb-2">Lightning Fast</h4>
                    <p className="text-muted-foreground">Process documents quickly with our streamlined interface and AI-powered extraction.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Shield className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold mb-2">Secure & Private</h4>
                    <p className="text-muted-foreground">Your data is encrypted and stored securely with enterprise-grade protection.</p>
                  </div>
                </div>
                <div className="flex gap-4">
                  <Users className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
                  <div>
                    <h4 className="font-semibold mb-2">User-Friendly</h4>
                    <p className="text-muted-foreground">Intuitive design that makes document processing accessible to everyone.</p>
                  </div>
                </div>
              </div>
            </div>
            <Card className="p-8">
              <CardHeader className="text-center p-0 mb-6">
                <CardTitle className="text-2xl">Ready to get started?</CardTitle>
                <CardDescription>
                  Create your account today and start processing documents more efficiently.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-4">
                  {user ? (
                    <Link to="/app" className="block">
                      <Button size="lg" className="w-full">
                        Go to App
                      </Button>
                    </Link>
                  ) : (
                    <>
                      <Link to="/signin" className="block">
                        <Button size="lg" className="w-full">
                          Create Account
                        </Button>
                      </Link>
                      <Link to="/app" className="block">
                        <Button size="lg" variant="outline" className="w-full">
                          Try Without Account
                        </Button>
                      </Link>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto text-center">
          <div className="flex items-center justify-center gap-4 mb-4">
            <img 
              src={extractorLogo} 
              alt="RunsheetPro Logo" 
              className="h-8 w-8"
            />
            <span className="font-semibold">RunsheetPro</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Professional document processing made simple. Powered by modern web technologies.
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Home;