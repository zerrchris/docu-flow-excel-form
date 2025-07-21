import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Mic, MicOff, Square, Wand2, Loader2, ChevronDown, ChevronUp, AlertCircle, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface RealtimeVoiceInputProps {
  fields: string[];
  columnInstructions: Record<string, string>;
  onDataExtracted: (data: Record<string, string>) => void;
  onTextTranscribed?: (text: string) => void;
}

// Audio recording and encoding utilities
class AudioRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;

  constructor(private onAudioData: (audioData: Float32Array) => void) {}

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      
      this.audioContext = new AudioContext({
        sampleRate: 24000,
      });
      
      this.source = this.audioContext.createMediaStreamSource(this.stream);
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
      
      this.processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        this.onAudioData(new Float32Array(inputData));
      };
      
      this.source.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      throw error;
    }
  }

  stop() {
    if (this.source) {
      this.source.disconnect();
      this.source = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

const encodeAudioForAPI = (float32Array: Float32Array): string => {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  
  const uint8Array = new Uint8Array(int16Array.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  
  for (let i = 0; i < uint8Array.length; i += chunkSize) {
    const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  
  return btoa(binary);
};

const RealtimeVoiceInput: React.FC<RealtimeVoiceInputProps> = ({
  fields,
  columnInstructions,
  onDataExtracted,
  onTextTranscribed
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const { toast } = useToast();

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Clear any previous chunks
      audioChunksRef.current = [];
      
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm'
      });
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      // Process audio every 3 seconds
      mediaRecorderRef.current.start(3000);
      setIsRecording(true);
      setTranscript('');
      
      toast({
        title: "Recording Started",
        description: "Speak naturally - audio will be transcribed every few seconds",
      });

      // Handle chunks as they come in
      mediaRecorderRef.current.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          await transcribeChunk(event.data);
        }
      };

    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording Error",
        description: "Failed to start recording. Please check microphone permissions.",
        variant: "destructive",
      });
    }
  };

  const transcribeChunk = async (audioBlob: Blob) => {
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: {
          audio: await blobToBase64(audioBlob),
          format: 'webm'
        }
      });

      if (error) {
        console.error('Transcription error:', error);
        return;
      }

      if (data?.text) {
        setTranscript(prev => prev + ' ' + data.text);
        onTextTranscribed?.(transcript + ' ' + data.text);
      }
    } catch (error) {
      console.error('Error transcribing chunk:', error);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]); // Remove data:audio/webm;base64, prefix
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      mediaRecorderRef.current = null;
    }
    setIsRecording(false);
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
          description: "Real-time voice input has been processed and form fields updated.",
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

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="w-full">
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between">
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
                   Real-time Voice Input
            {isRecording && (
              <div className="flex items-center gap-1 text-red-500">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="text-xs">Recording</span>
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
                  disabled={isProcessing}
                  className="flex items-center gap-2"
                >
                  <Mic className="h-4 w-4" />
                  Start Voice Recording
                </Button>
              ) : (
                <Button
                  onClick={stopRecording}
                  variant="destructive"
                  className="flex items-center gap-2"
                >
                  <Square className="h-4 w-4" />
                  Stop Recording
                </Button>
              )}
            </div>

            {/* Recording status indicator */}
            {isRecording && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
                <span>Recording and transcribing...</span>
              </div>
            )}

            {/* Live Transcript Display and Edit Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Voice Transcript {transcript && `(${transcript.length} characters)`}
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
                  placeholder="Start recording to see transcription appear here..."
                  className="min-h-[150px] w-full resize-y text-base leading-relaxed"
                  disabled={isProcessing}
                />
                
                {/* Status indicator */}
                <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                  {transcript.length > 0 && `${transcript.length} chars`}
                  {isRecording && "🎙️ Recording"}
                </div>
              </div>

              {/* Transcript Status */}
              {transcript && (
                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 text-green-500" />
                    <div>
                      <p className="font-medium text-foreground mb-1">Voice Transcription Complete</p>
                      <p>
                        Transcription powered by OpenAI Whisper. Review and edit if needed, then process to extract structured data.
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
                disabled={!transcript.trim() || isProcessing || isRecording}
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
              <p>🎙️ <strong>Voice Recognition:</strong> Record your voice and get text transcription</p>
              <p className="italic">
                Perfect for natural descriptions: "This warranty deed from June 2012 transfers property 
                from John Smith to Mary Johnson in the northwest quarter of section 3..."
              </p>
            </div>
          </CardContent>
        </Card>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default RealtimeVoiceInput;