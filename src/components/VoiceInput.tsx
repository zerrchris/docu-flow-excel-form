import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Mic, MicOff, Volume2, VolumeX, RotateCw, CheckCircle, AlertCircle, X, Square, Wand2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const { toast } = useToast();

  // Check for MediaRecorder support
  useEffect(() => {
    setIsSupported(!!window.MediaRecorder);
    
    if (!window.MediaRecorder) {
      console.warn('MediaRecorder not supported in this browser');
    }
  }, []);

  const startRecording = async () => {
    if (!isSupported) {
      toast({
        title: "Not Supported",
        description: "Audio recording is not supported in this browser. Try Chrome or Edge.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Request microphone permission and get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];
      
      // Create MediaRecorder instance
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        setIsRecording(false);
        await transcribeAudio();
      };
      
      mediaRecorder.start();
      setIsRecording(true);
      
      if (!isMuted) {
        toast({
          title: "Recording Started",
          description: "Speak clearly about the document information",
        });
      }
      
    } catch (error) {
      console.error('Error starting audio recording:', error);
      toast({
        title: "Microphone Access",
        description: "Please allow microphone access to use voice input.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      
      // Stop all tracks to release microphone
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  const transcribeAudio = async () => {
    if (audioChunksRef.current.length === 0) {
      toast({
        title: "No Audio",
        description: "No audio was recorded. Please try again.",
        variant: "destructive",
      });
      return;
    }

    setIsTranscribing(true);
    
    try {
      // Combine audio chunks into a single blob
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      
      // Convert blob to base64
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1]; // Remove data URL prefix
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      console.log('Sending audio to OpenAI Whisper for transcription...');

      // Send audio to our transcription edge function
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio: base64Audio,
          format: 'webm'
        }
      });

      if (error) {
        throw new Error(error.message);
      }

      console.log('Transcription result:', data);

      if (data.success && data.text) {
        setTranscript(data.text);
        onTextTranscribed?.(data.text);
        
        if (!isMuted) {
          toast({
            title: "Transcription Complete",
            description: "Audio has been converted to text. Review and process when ready.",
          });
        }
      } else {
        throw new Error(data.error || 'Failed to transcribe audio');
      }
    } catch (error) {
      console.error('Error transcribing audio:', error);
      toast({
        title: "Transcription Failed",
        description: error instanceof Error ? error.message : "Failed to transcribe audio",
        variant: "destructive",
      });
    } finally {
      setIsTranscribing(false);
    }
  };

  const processTranscript = async () => {
    if (!transcript.trim()) {
      toast({
        title: "No text to process",
        description: "Please record some audio first or enter text manually.",
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
            Audio recording is not supported in this browser. Try Chrome or Edge.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="w-full">
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            Voice Input
            {(isRecording || isTranscribing) && (
              <div className="flex items-center gap-1 text-red-500">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-xs">
                  {isRecording ? 'Recording' : 'Transcribing'}
                </span>
              </div>
            )}
          </div>
          {isExpanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="mt-2">
        <Card className="w-full">
          <CardContent className="p-4 space-y-4">
            {/* Voice Controls */}
            <div className="flex items-center justify-center gap-2">
              {!isRecording ? (
                <Button
                  onClick={startRecording}
                  disabled={isTranscribing || isProcessing}
                  className="flex items-center gap-2"
                >
                  <Mic className="h-4 w-4" />
                  Start Recording
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={stopRecording}
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

            {/* Recording/Transcribing indicator */}
            {(isRecording || isTranscribing) && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
                <span>
                  {isRecording && 'Recording audio...'}
                  {isTranscribing && 'Converting speech to text...'}
                </span>
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
                  placeholder="Record audio or type your text here. The AI will extract relevant information from your description..."
                  className="min-h-[150px] w-full resize-y text-base leading-relaxed"
                  disabled={isRecording || isTranscribing || isProcessing}
                />
                
                {/* Character count and status */}
                <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                  {transcript.length > 0 && `${transcript.length} chars`}
                  {isRecording && "Recording audio..."}
                  {isTranscribing && "Transcribing..."}
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
                        Text transcribed using OpenAI Whisper. Please review and make any necessary corrections before processing. 
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
                disabled={!transcript.trim() || isProcessing || isRecording || isTranscribing}
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
              <p>🎙️ <strong>High-Quality Voice Recognition:</strong> Uses OpenAI Whisper for accurate transcription</p>
              <p className="italic">
                "This is a warranty deed recorded on June 3rd 2012, from John Smith to Mary Johnson, 
                for the northwest quarter of section 3..."
              </p>
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default VoiceInput;