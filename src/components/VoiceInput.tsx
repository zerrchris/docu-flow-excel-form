import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Mic, MicOff, Volume2, VolumeX, RotateCw, CheckCircle, AlertCircle } from 'lucide-react';
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
        title: "No Speech Detected",
        description: "Please speak first, then process the text.",
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
          fields,
          columnInstructions
        }
      });

      if (error) {
        throw new Error(error.message || 'Failed to analyze voice input');
      }

      if (!data.success) {
        throw new Error(data.error || 'Analysis failed');
      }

      console.log('Voice analysis result:', data);
      
      onDataExtracted(data.extractedData);
      
      if (!isMuted) {
        toast({
          title: "Voice Analysis Complete",
          description: "Information extracted and added to the form!",
        });
      }

      // Clear transcript after successful processing
      setTranscript('');
      
    } catch (error) {
      console.error('Error processing voice input:', error);
      toast({
        title: "Processing Error",
        description: error instanceof Error ? error.message : 'Failed to process voice input',
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

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  if (!isSupported) {
    return (
      <Card className="p-4 border-2 border-dashed border-muted-foreground/25">
        <div className="text-center text-muted-foreground">
          <AlertCircle className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">Voice input is not supported in this browser.</p>
          <p className="text-xs mt-1">Try Chrome, Edge, or Safari for voice recognition.</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Voice Input</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleMute}
          className="p-2"
        >
          {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>

      <div className="flex flex-col gap-3">
        {/* Voice Controls */}
        <div className="flex gap-2">
          <Button
            onClick={startListening}
            disabled={isListening || isProcessing}
            className={`flex-1 ${isListening ? 'bg-red-500 hover:bg-red-600' : 'bg-primary hover:bg-primary/90'}`}
          >
            {isListening ? (
              <>
                <MicOff className="h-4 w-4 mr-2" />
                Listening... (Click to stop)
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 mr-2" />
                Start Voice Input
              </>
            )}
          </Button>
          
          {isListening && (
            <Button
              onClick={stopListening}
              variant="outline"
              className="px-3"
            >
              Stop
            </Button>
          )}
        </div>

        {/* Transcript Display */}
        {transcript && (
          <div className="space-y-2">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm font-medium text-muted-foreground mb-1">Transcribed Text:</p>
              <p className="text-sm text-foreground">{transcript}</p>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={processTranscript}
                disabled={isProcessing || isListening}
                className="flex-1"
              >
                {isProcessing ? (
                  <>
                    <RotateCw className="h-4 w-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Extract Data
                  </>
                )}
              </Button>
              
              <Button
                onClick={clearTranscript}
                variant="outline"
                disabled={isProcessing || isListening}
                className="px-3"
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Instructions */}
        {!transcript && (
          <div className="text-center text-muted-foreground p-4">
            <Mic className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">
              Click "Start Voice Input" and speak about the document information.
            </p>
            <p className="text-xs mt-1">
              The AI will extract data based on your current spreadsheet fields.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default VoiceInput;