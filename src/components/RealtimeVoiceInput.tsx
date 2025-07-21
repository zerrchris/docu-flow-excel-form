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
  const [isConnected, setIsConnected] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const { toast } = useToast();

  const projectId = 'xnpmrafjjqsissbtempj'; // Your project ID

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, []);

  const connect = async () => {
    try {
      setConnectionError(null);
      
      // Create WebSocket connection to our edge function
      const wsUrl = `wss://${projectId}.functions.supabase.co/functions/v1/realtime-voice`;
      console.log('Connecting to:', wsUrl);
      
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        toast({
          title: "Connected",
          description: "Real-time voice input is ready",
        });
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received message:', data.type, data);

          switch (data.type) {
            case 'session.updated':
              console.log('Session updated successfully');
              break;

            case 'input_audio_buffer.speech_started':
              console.log('Speech started');
              setIsSpeaking(true);
              break;

            case 'input_audio_buffer.speech_stopped':
              console.log('Speech stopped');
              setIsSpeaking(false);
              break;

            case 'conversation.item.input_audio_transcription.delta':
              console.log('Transcription delta:', data.delta);
              if (data.delta) {
                setTranscript(prev => prev + data.delta);
                onTextTranscribed?.(transcript + data.delta);
              }
              break;

            case 'conversation.item.input_audio_transcription.completed':
              console.log('Transcription completed:', data.transcript);
              if (data.transcript) {
                setTranscript(data.transcript);
                onTextTranscribed?.(data.transcript);
              }
              break;

            case 'error':
              console.error('WebSocket error:', data.error);
              setConnectionError(data.error);
              toast({
                title: "Connection Error",
                description: data.error,
                variant: "destructive",
              });
              break;
          }
        } catch (error) {
          console.error('Error parsing message:', error);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionError('Connection failed');
        toast({
          title: "Connection Error",
          description: "Failed to connect to real-time voice service",
          variant: "destructive",
        });
      };

      wsRef.current.onclose = () => {
        console.log('WebSocket closed');
        setIsConnected(false);
        setIsRecording(false);
        setIsSpeaking(false);
      };

    } catch (error) {
      console.error('Connection error:', error);
      setConnectionError('Failed to establish connection');
    }
  };

  const disconnect = () => {
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
      audioRecorderRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setIsRecording(false);
    setIsSpeaking(false);
  };

  const startRecording = async () => {
    if (!isConnected) {
      await connect();
      // Wait a moment for connection to stabilize
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    try {
      // Start audio recording
      audioRecorderRef.current = new AudioRecorder((audioData) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          const encodedAudio = encodeAudioForAPI(audioData);
          wsRef.current.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: encodedAudio
          }));
        }
      });

      await audioRecorderRef.current.start();
      setIsRecording(true);
      setTranscript(''); // Clear previous transcript
      
      toast({
        title: "Recording Started",
        description: "Speak naturally - you'll see live transcription",
      });

    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Recording Error",
        description: "Failed to start recording. Please check microphone permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (audioRecorderRef.current) {
      audioRecorderRef.current.stop();
      audioRecorderRef.current = null;
    }
    setIsRecording(false);
    setIsSpeaking(false);
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
                <span className="text-xs">
                  {isSpeaking ? 'Speaking' : 'Listening'}
                </span>
              </div>
            )}
            {!isConnected && connectionError && (
              <div className="text-xs text-red-500">Disconnected</div>
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
            {/* Connection Status */}
            {connectionError && (
              <div className="text-sm text-red-600 bg-red-50 p-2 rounded-md">
                Connection Error: {connectionError}
              </div>
            )}

            {/* Voice Controls */}
            <div className="flex items-center justify-center gap-2">
              {!isRecording ? (
                <Button
                  onClick={startRecording}
                  disabled={isProcessing}
                  className="flex items-center gap-2"
                >
                  <Mic className="h-4 w-4" />
                  Start Real-time Recording
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

            {/* Live status indicator */}
            {isRecording && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }}></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }}></div>
                </div>
                <span>
                  {isSpeaking ? 'Speaking - Live transcription...' : 'Listening for speech...'}
                </span>
              </div>
            )}

            {/* Live Transcript Display and Edit Area */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  Live Transcript {transcript && `(${transcript.length} characters)`}
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
                  placeholder="Start recording to see live transcription appear here as you speak..."
                  className="min-h-[150px] w-full resize-y text-base leading-relaxed"
                  disabled={isRecording || isProcessing}
                />
                
                {/* Status indicator */}
                <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
                  {transcript.length > 0 && `${transcript.length} chars`}
                  {isRecording && isSpeaking && "🎙️ Live"}
                  {isRecording && !isSpeaking && "🔊 Listening"}
                </div>
              </div>

              {/* Transcript Status */}
              {transcript && (
                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 mt-0.5 text-green-500" />
                    <div>
                      <p className="font-medium text-foreground mb-1">Live Transcription Active</p>
                      <p>
                        Real-time transcription powered by OpenAI Whisper. The text updates as you speak. 
                        Review and edit if needed, then process to extract structured data.
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
              <p>🎙️ <strong>Real-time Voice Recognition:</strong> See your words appear instantly as you speak</p>
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