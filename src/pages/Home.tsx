import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogIn, FileText, Save, FolderOpen, Users, Shield, Zap, CreditCard } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { User as SupabaseUser } from '@supabase/supabase-js';
import { useSubscription } from '@/contexts/SubscriptionContext';
import extractorLogo from '@/assets/document-extractor-logo.png';
import AuthButton from '@/components/AuthButton';
const Home: React.FC = () => {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [hoveredImage, setHoveredImage] = useState<string | null>(null);
  const {
    subscribed,
    subscriptionTier
  } = useSubscription();
  useEffect(() => {
    const initAuth = async () => {
      const {
        data: {
          session
        }
      } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      const {
        data: {
          subscription
        }
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });
      return () => subscription.unsubscribe();
    };
    initAuth();
  }, []);
  return <div className="min-h-screen bg-background relative">
      {/* Full Screen Image Overlay */}
      {hoveredImage && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-8"
          onMouseEnter={() => setHoveredImage(hoveredImage)}
          onMouseLeave={() => setHoveredImage(null)}
        >
          <img 
            src={hoveredImage} 
            alt="Enlarged workflow step" 
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl animate-scale-in"
          />
        </div>
      )}
      {/* Header */}
      <header className="border-b w-full">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img src={extractorLogo} alt="RunsheetPro Logo" className="h-12 w-12" />
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                RunsheetPro
              </h1>
            </div>
            <div className="flex items-center gap-4">
              {user && subscribed && <Badge variant="default" className="gap-1">
                  <CreditCard className="h-3 w-3" />
                  {subscriptionTier} Plan
                </Badge>}
              {user ? subscribed ? <Link to="/pricing">
                    <Button variant="outline">Manage Subscription</Button>
                  </Link> : <Link to="/pricing">
                    <Button>Get Subscription</Button>
                  </Link> : <AuthButton />}
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
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">Turn messy documents into organized data in minutes. Upload any document, let AI extract the key information, and instantly add it to your runsheet.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? <Link to="/app">
                <Button size="lg" className="gap-2">
                  <FileText className="h-5 w-5" />
                  Open App
                </Button>
              </Link> : <Link to="/signin">
                <Button size="lg" className="gap-2">
                  <LogIn className="h-5 w-5" />
                  Get Started
                </Button>
              </Link>}
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
                <CardDescription>Organize, edit, and manage your sheets and documents </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <h3 className="text-3xl font-bold text-center mb-12">
            How it Works
          </h3>
          <p className="text-lg text-muted-foreground text-center mb-16 max-w-3xl mx-auto">
            See how easy it is to transform your documents into organized data with our 4-step process
          </p>
          
          <div className="space-y-16">
            {/* Step 1 */}
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div className="order-2 lg:order-1">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    1
                  </div>
                  <h4 className="text-2xl font-semibold">Start Your Runsheet</h4>
                </div>
                <p className="text-muted-foreground text-lg mb-4">Begin by creating a new runsheet from the welcome screen. Choose "New Runsheet" to start with a blank template, or "Open Runsheet" to load a previously saved one.</p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Multiple workflow options available</li>
                  <li>• Professional welcome interface</li>
                  <li>• Easy runsheet management</li>
                </ul>
              </div>
              <div className="order-1 lg:order-2">
                <img 
                  src="/lovable-uploads/7149754a-1f31-458f-9a00-b21051d1c5c4.png" 
                  alt="RunsheetPro welcome screen with workflow options" 
                  className="rounded-lg shadow-lg w-full cursor-pointer transition-transform duration-200 hover:scale-105" 
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/7149754a-1f31-458f-9a00-b21051d1c5c4.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                />
              </div>
            </div>

            {/* Step 1.5 - Working with Runsheet */}
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <img 
                  src="/lovable-uploads/901ca479-cc15-44c2-ac1e-511e6913d2d5.png" 
                  alt="Active runsheet interface with data" 
                  className="rounded-lg shadow-lg w-full cursor-pointer transition-transform duration-200 hover:scale-105" 
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/901ca479-cc15-44c2-ac1e-511e6913d2d5.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                />
              </div>
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    1b
                  </div>
                  <h4 className="text-2xl font-semibold">Work on Your Runsheet</h4>
                </div>
                <p className="text-muted-foreground text-lg mb-4">
                  Once your runsheet is open, work with it as normal - entering data, organizing information, and managing your records in the professional spreadsheet interface.
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Professional spreadsheet interface</li>
                  <li>• Customizable columns and fields</li>
                  <li>• Cloud storage and sync</li>
                </ul>
              </div>
            </div>

            {/* Step 2 */}
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <img 
                  src="/lovable-uploads/e910cd5a-0990-432c-bda8-9d1b14f8b8fa.png" 
                  alt="Document processor upload interface" 
                  className="rounded-lg shadow-lg w-full cursor-pointer transition-transform duration-200 hover:scale-105" 
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/e910cd5a-0990-432c-bda8-9d1b14f8b8fa.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                />
              </div>
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    2
                  </div>
                  <h4 className="text-2xl font-semibold">Upload Your Document</h4>
                </div>
                <p className="text-muted-foreground text-lg mb-4">
                  When ready to analyze a document, go to the Document Processor. Upload your document using the highlighted "Document Capture" button.
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Supports PDF, JPG, PNG formats</li>
                  <li>• Drag & drop interface</li>
                  <li>• Mobile camera capture available</li>
                </ul>
              </div>
            </div>

            {/* Step 3 */}
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div className="order-2 lg:order-1">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    3
                  </div>
                  <h4 className="text-2xl font-semibold">Analyze with AI</h4>
                </div>
                <p className="text-muted-foreground text-lg mb-4">
                  Click the highlighted "Analyze Document" button and watch as our AI instantly reads your document and extracts key information into organized fields.
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• AI-powered text extraction</li>
                  <li>• Intelligent field detection</li>
                  <li>• Works with handwritten text</li>
                </ul>
              </div>
              <div className="order-1 lg:order-2">
                <img 
                  src="/lovable-uploads/43ca29ad-3e45-4d92-831d-ba5100515a62.png" 
                  alt="Document analysis with highlighted analyze button" 
                  className="rounded-lg shadow-lg w-full cursor-pointer transition-transform duration-200 hover:scale-105" 
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/43ca29ad-3e45-4d92-831d-ba5100515a62.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                />
              </div>
            </div>

            {/* Step 4 */}
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <img 
                  src="/lovable-uploads/98320272-b5c8-4a78-b5d0-d8cbf36a89a6.png" 
                  alt="Add to runsheet with highlighted button" 
                  className="rounded-lg shadow-lg w-full cursor-pointer transition-transform duration-200 hover:scale-105" 
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/98320272-b5c8-4a78-b5d0-d8cbf36a89a6.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                />
              </div>
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    4
                  </div>
                  <h4 className="text-2xl font-semibold">Review & Add to Runsheet</h4>
                </div>
                <p className="text-muted-foreground text-lg mb-4">
                  Review the extracted data for accuracy, make any necessary corrections, then click "Add to Runsheet". The data will be added to the next row of your runsheet with a document file reference.
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Automatic data validation</li>
                  <li>• Document reference number assigned</li>
                  <li>• One-click addition to runsheet</li>
                </ul>
              </div>
            </div>

            {/* Step 5 */}
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div className="order-2 lg:order-1">
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    5
                  </div>
                  <h4 className="text-2xl font-semibold">Access Linked Documents</h4>
                </div>
                <p className="text-muted-foreground text-lg mb-4">
                  Once added to your runsheet, documents are automatically linked and accessible. Click on any document reference number or file icon to instantly view the original document associated with that row.
                </p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Permanent document linking</li>
                  <li>• Quick access to source files</li>
                  <li>• Files included in runsheet downloads</li>
                </ul>
              </div>
              <div className="order-1 lg:order-2">
                <img 
                  src="/lovable-uploads/dcd42115-3fc1-4647-8e5c-1773e44f0763.png" 
                  alt="Runsheet showing linked documents with file access" 
                  className="rounded-lg shadow-lg w-full cursor-pointer transition-transform duration-200 hover:scale-105" 
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/dcd42115-3fc1-4647-8e5c-1773e44f0763.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                />
              </div>
            </div>
          </div>

          {/* CTA after workflow */}
          <div className="text-center mt-16">
            <div className="bg-muted/50 rounded-2xl p-8 max-w-2xl mx-auto">
              <h4 className="text-2xl font-semibold mb-4">Ready to streamline your workflow?</h4>
              <p className="text-muted-foreground mb-6">
                Join hundreds of users who have already transformed their document processing
              </p>
              {user ? <Link to="/app">
                  <Button size="lg" className="gap-2">
                    <FileText className="h-5 w-5" />
                    Try It Now
                  </Button>
                </Link> : <Link to="/signin">
                  <Button size="lg" className="gap-2">
                    <LogIn className="h-5 w-5" />
                    Start Free Trial
                  </Button>
                </Link>}
            </div>
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
                    <h4 className="font-semibold mb-2">Fast</h4>
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
                    <p className="text-muted-foreground">Intuitive design that makes data extraction seamless.</p>
                  </div>
                </div>
              </div>
            </div>
            <Card className="p-8">
              <CardHeader className="text-center p-0 mb-6">
                <CardTitle className="text-2xl">Ready to get started?</CardTitle>
                <CardDescription>Create your account today and start runsheets like a pro.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-4">
                  {user ? <Link to="/app" className="block">
                      <Button size="lg" className="w-full">
                        Go to App
                      </Button>
                    </Link> : <Link to="/signin?mode=signup" className="block">
                      <Button size="lg" className="w-full">
                        Create Account
                      </Button>
                    </Link>}
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
            <img src={extractorLogo} alt="RunsheetPro Logo" className="h-8 w-8" />
            <span className="font-semibold">RunsheetPro</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Professional document processing made simple. Powered by modern web technologies.
          </p>
        </div>
      </footer>
    </div>;
};
export default Home;