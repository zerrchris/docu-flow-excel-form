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
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);
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
  return <div className="min-h-screen bg-background">
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
                    •
                  </div>
                  <h4 className="text-2xl font-semibold">Start Your Runsheet</h4>
                </div>
                <p className="text-muted-foreground text-lg mb-4">Begin by choosing your workflow from the welcome screen. You can create a new runsheet, continue where you left off with an active runsheet, upload an existing runsheet file, open a previously saved runsheet, or connect to Google Drive to import spreadsheets.</p>
                <ul className="space-y-2 text-muted-foreground">
                  <li>• Create new runsheet from scratch</li>
                  <li>• Continue working on active runsheets</li>
                  <li>• Upload existing Excel/CSV files</li>
                  <li>• Open previously saved runsheets</li>
                  <li>• Connect Google Drive integration</li>
                </ul>
              </div>
              <div className="order-1 lg:order-2">
                <div 
                  className="relative group cursor-pointer"
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/255c2ba1-c964-4a54-9d70-6c1da31848f3.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                  onClick={() => setEnlargedImage("/lovable-uploads/255c2ba1-c964-4a54-9d70-6c1da31848f3.png")}
                >
                  <img src="/lovable-uploads/255c2ba1-c964-4a54-9d70-6c1da31848f3.png" alt="RunsheetPro welcome screen with workflow options" className="rounded-lg shadow-lg w-full transition-all duration-300 group-hover:brightness-75" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-black/50 backdrop-blur-sm rounded-full p-3 flex items-center gap-2 text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                      <span className="text-sm font-medium">Click to enlarge</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 1.5 - Working with Runsheet */}
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <div 
                  className="relative group cursor-pointer"
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/901ca479-cc15-44c2-ac1e-511e6913d2d5.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                  onClick={() => setEnlargedImage("/lovable-uploads/901ca479-cc15-44c2-ac1e-511e6913d2d5.png")}
                >
                  <img src="/lovable-uploads/901ca479-cc15-44c2-ac1e-511e6913d2d5.png" alt="Active runsheet interface with data" className="rounded-lg shadow-lg w-full transition-all duration-300 group-hover:brightness-75" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-black/50 backdrop-blur-sm rounded-full p-3 flex items-center gap-2 text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                      <span className="text-sm font-medium">Click to enlarge</span>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    •
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
                <div 
                  className="relative group cursor-pointer"
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/e910cd5a-0990-432c-bda8-9d1b14f8b8fa.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                  onClick={() => setEnlargedImage("/lovable-uploads/e910cd5a-0990-432c-bda8-9d1b14f8b8fa.png")}
                >
                  <img src="/lovable-uploads/e910cd5a-0990-432c-bda8-9d1b14f8b8fa.png" alt="Document processor upload interface" className="rounded-lg shadow-lg w-full transition-all duration-300 group-hover:brightness-75" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-black/50 backdrop-blur-sm rounded-full p-3 flex items-center gap-2 text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                      <span className="text-sm font-medium">Click to enlarge</span>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    •
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
                    •
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
                <div 
                  className="relative group cursor-pointer"
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/43ca29ad-3e45-4d92-831d-ba5100515a62.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                  onClick={() => setEnlargedImage("/lovable-uploads/43ca29ad-3e45-4d92-831d-ba5100515a62.png")}
                >
                  <img src="/lovable-uploads/43ca29ad-3e45-4d92-831d-ba5100515a62.png" alt="Document analysis with highlighted analyze button" className="rounded-lg shadow-lg w-full transition-all duration-300 group-hover:brightness-75" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-black/50 backdrop-blur-sm rounded-full p-3 flex items-center gap-2 text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                      <span className="text-sm font-medium">Click to enlarge</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 4 */}
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <div>
                <div 
                  className="relative group cursor-pointer"
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/98320272-b5c8-4a78-b5d0-d8cbf36a89a6.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                  onClick={() => setEnlargedImage("/lovable-uploads/98320272-b5c8-4a78-b5d0-d8cbf36a89a6.png")}
                >
                  <img src="/lovable-uploads/98320272-b5c8-4a78-b5d0-d8cbf36a89a6.png" alt="Add to runsheet with highlighted button" className="rounded-lg shadow-lg w-full transition-all duration-300 group-hover:brightness-75" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-black/50 backdrop-blur-sm rounded-full p-3 flex items-center gap-2 text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                      <span className="text-sm font-medium">Click to enlarge</span>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    •
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
                    •
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
                <div 
                  className="relative group cursor-pointer"
                  onMouseEnter={() => setHoveredImage("/lovable-uploads/dcd42115-3fc1-4647-8e5c-1773e44f0763.png")}
                  onMouseLeave={() => setHoveredImage(null)}
                  onClick={() => setEnlargedImage("/lovable-uploads/dcd42115-3fc1-4647-8e5c-1773e44f0763.png")}
                >
                  <img src="/lovable-uploads/dcd42115-3fc1-4647-8e5c-1773e44f0763.png" alt="Runsheet showing linked documents with file access" className="rounded-lg shadow-lg w-full transition-all duration-300 group-hover:brightness-75" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="bg-black/50 backdrop-blur-sm rounded-full p-3 flex items-center gap-2 text-white">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                      </svg>
                      <span className="text-sm font-medium">Click to enlarge</span>
                    </div>
                  </div>
                </div>
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

      {/* Image Enlargement Overlay */}
      {enlargedImage && (
        <div 
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setEnlargedImage(null)}
        >
          <div className="relative max-w-7xl max-h-full">
            <img 
              src={enlargedImage} 
              alt="Enlarged view" 
              className="max-w-full max-h-full object-contain rounded-lg"
            />
            <button 
              onClick={() => setEnlargedImage(null)}
              className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>;
};
export default Home;