import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Mic, MicOff, Volume2, VolumeX, RotateCw, CheckCircle, AlertCircle, X, Square, Wand2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

// Type definitions for Web Speech API
interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onstart: ((this: SpeechRecognition, ev: Event) => any) | null;
  onend: ((this: SpeechRecognition, ev: Event) => any) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => any) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => any) | null;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

declare global {
  interface Window {
    SpeechRecognition: {
      new (): SpeechRecognition;
    };
    webkitSpeechRecognition: {
      new (): SpeechRecognition;
    };
  }
}

interface VoiceInputProps {
  fields: string[];
  columnInstructions: Record<string, string>;
  onDataExtracted: (data: Record<string, string>) => void;
  onTextTranscribed?: (text: string) => void;
}

const VoiceInput: React.FC<VoiceInputProps> = ({
  fields,
  columnInstructions,
  onDataExtracted,
  onTextTranscribed
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const { toast } = useToast();

  // Check for Web Speech API support
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
    
    if (!SpeechRecognition) {
      console.warn('Web Speech API not supported in this browser');
      return;
    }

    // Initialize speech recognition
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    // Event handlers
    recognition.onstart = () => {
      console.log('Voice recognition started');
      setIsListening(true);
      if (!isMuted) {
        toast({
          title: "Listening...",
          description: "Speak clearly about the document information",
        });
      }
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      const combinedTranscript = finalTranscript || interimTranscript;
      setTranscript(combinedTranscript);
      onTextTranscribed?.(combinedTranscript);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      
      let errorMessage = 'Voice recognition error occurred';
      switch (event.error) {
        case 'no-speech':
          errorMessage = 'No speech was detected. Please speak clearly.';
          break;
        case 'audio-capture':
          errorMessage = 'No microphone was found. Please check your microphone.';
          break;
        case 'not-allowed':
          errorMessage = 'Microphone permission denied. Please allow microphone access.';
          break;
        case 'network':
          errorMessage = 'Network error occurred during voice recognition.';
          break;
        default:
          errorMessage = `Voice recognition error: ${event.error}`;
      }
      
      toast({
        title: "Voice Recognition Error",
        description: errorMessage,
        variant: "destructive",
      });
    };

    recognition.onend = () => {
      console.log('Voice recognition ended');
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognition) {
        recognition.stop();
      }
    };
  }, [toast, onTextTranscribed, isMuted]);

  const startListening = async () => {
    if (!recognitionRef.current) {
      toast({
        title: "Not Supported",
        description: "Voice recognition is not supported in this browser. Try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Request microphone permission
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      setTranscript('');
      recognitionRef.current.start();
    } catch (error) {
      console.error('Error starting voice recognition:', error);
      toast({
        title: "Microphone Access",
        description: "Please allow microphone access to use voice input.",
        variant: "destructive",
      });
    }
  };

  const stopListening = () => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  };

  const processTranscript = async () => {
    if (!transcript.trim()) {
      toast({
        title: "No text to process",
        description: "Please speak some text first or enter text manually.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    
    try {
      console.log('Processing transcript:', transcript);
      console.log('With fields:', fields);
      
      const { data, error } = await supabase.functions.invoke('analyze-voice-text', {
        body: {
          text: transcript,
          fields: fields,
          columnInstructions: columnInstructions
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log('Voice analysis result:', data);
      
      if (data.success && data.extractedData) {
        onDataExtracted(data.extractedData);
        toast({
          title: "Data extracted successfully",
          description: "Voice input has been processed and form fields updated.",
        });
        
        // Clear transcript after successful processing
        clearTranscript();
      } else {
        throw new Error(data.error || 'Failed to extract data');
      }
    } catch (error) {
      console.error('Error processing voice text:', error);
      toast({
        title: "Processing failed",
        description: error instanceof Error ? error.message : "Failed to process voice input",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const clearTranscript = () => {
    setTranscript('');
    onTextTranscribed?.('');
  };

  const handleTranscriptChange = (value: string) => {
    setTranscript(value);
    onTextTranscribed?.(value);
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  if (!isSupported) {
    return (
      <Card className="w-full">
        <CardContent className="p-4">
          <p className="text-muted-foreground text-center">
            Voice recognition is not supported in this browser
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="w-full">
      <Card className="w-full">
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="h-5 w-5" />
                Voice Input
              </div>
              <div className="flex items-center gap-2">
                {isListening && (
                  <div className="flex items-center gap-1 text-sm text-red-500">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <span className="text-xs">Recording</span>
                  </div>
                )}
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Voice Controls */}
            <div className="flex items-center justify-center gap-2">
              {!isListening ? (
                <Button
                  onClick={startListening}
                  disabled={isProcessing}
                  className="flex items-center gap-2"
                >
                  <Mic className="h-4 w-4" />
                  Start Voice Input
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={stopListening}
                    variant="destructive"
                    className="flex items-center gap-2"
                  >
                    <Square className="h-4 w-4" />
                    Stop Recording
                  </Button>
                  <Button
                    onClick={toggleMute}
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    {isMuted ? 'Unmute' : 'Mute'}
                  </Button>
                </div>
              )}
            </div>

            {/* Live transcription indicator */}
            {isListening && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
                <span>Listening...</span>
              </div>
            )}

            {/* Large Transcript Display and Edit Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Transcribed Text {transcript && `(${transcript.length} characters)`}
                </label>
                {transcript && (
                  <Button
                    onClick={clearTranscript}
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                    Clear
                  </Button>
                )}
              </div>
              
              <div className="relative">
                <Textarea
                  value={transcript}
                  onChange={(e) => handleTranscriptChange(e.target.value)}
                  placeholder="Speak or type your text here. The AI will extract relevant information from your description..."
                  className="min-h-[150px] w-full resize-y text-base leading-relaxed"
                  disabled={isListening || isProcessing}
                />
                
                {/* Character count and status */}
                <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                  {transcript.length > 0 && `${transcript.length} chars`}
                  {isListening && transcript.length === 0 && "Listening for speech..."}
                </div>
              </div>

              {/* Transcript Status */}
              {transcript && (
                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 text-blue-500" />
                    <div>
                      <p className="font-medium text-foreground mb-1">Review Your Text</p>
                      <p>
                        Please review the transcribed text above and make any necessary corrections before processing. 
                        The AI will extract information like names, dates, legal descriptions, and other relevant details 
                        from your description.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Process Button */}
            <div className="flex justify-center">
              <Button
                onClick={processTranscript}
                disabled={!transcript.trim() || isProcessing || isListening}
                className="flex items-center gap-2 min-w-[200px]"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing with AI...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    Extract Data from Text
                  </>
                )}
              </Button>
            </div>

            {/* Help Text */}
            <div className="text-xs text-muted-foreground text-center space-y-1">
              <p>💡 <strong>Tip:</strong> Speak naturally about the document. For example:</p>
              <p className="italic">
                "This is a warranty deed recorded on June 3rd 2012, from John Smith to Mary Johnson, 
                for the northwest quarter of section 3..."
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

export default VoiceInput;