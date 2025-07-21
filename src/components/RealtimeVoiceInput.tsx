import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Mic, MicOff, ChevronDown, ChevronUp } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface RealtimeVoiceInputProps {
  onDataExtracted: (data: Record<string, string>) => void;
  fields: string[];
  columnInstructions?: Record<string, string>;
  onTextTranscribed?: (text: string) => void;
}

const RealtimeVoiceInput: React.FC<RealtimeVoiceInputProps> = ({ 
  onDataExtracted, 
  fields, 
  columnInstructions,
  onTextTranscribed 
}) => {
  const { toast } = useToast();
  const [isRecording, setIsRecording] = useState(false);
  const [transcribedText, setTranscribedText] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        if (audioChunksRef.current.length > 0) {
          await processAudioChunks();
        }
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Process audio in chunks every 3 seconds for more responsive transcription
      recordingIntervalRef.current = setInterval(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          setTimeout(() => {
            if (!isRecording) return; // Check if still recording
            mediaRecorder.start();
          }, 100);
        }
      }, 3000);

      toast({
        title: "Recording started",
        description: "Speak clearly into your microphone",
      });
    } catch (error) {
      console.error('Error starting recording:', error);
      toast({
        title: "Error",
        description: "Could not access microphone",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setIsRecording(false);
  };

  const processAudioChunks = async () => {
    if (audioChunksRef.current.length === 0) return;

    setIsProcessing(true);
    try {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      
      // Convert blob to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        try {
          const { data, error } = await supabase.functions.invoke('transcribe-audio', {
            body: { audio: base64Audio }
          });

          if (error) throw error;

          if (data?.text) {
            // Append new transcription to existing text
            setTranscribedText(prev => {
              const newText = prev ? `${prev} ${data.text}` : data.text;
              onTextTranscribed?.(newText.trim());
              return newText.trim();
            });
          }
        } catch (error) {
          console.error('Transcription error:', error);
          toast({
            title: "Transcription failed",
            description: "Could not transcribe audio",
            variant: "destructive",
          });
        }
      };
      reader.readAsDataURL(audioBlob);
    } finally {
      setIsProcessing(false);
      // Clear chunks for next batch
      audioChunksRef.current = [];
    }
  };

  const handleAnalyze = async () => {
    if (!transcribedText.trim()) {
      toast({
        title: "No text to analyze",
        description: "Please record some audio first",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-voice-text', {
        body: { 
          text: transcribedText,
          fields,
          columnInstructions 
        }
      });

      if (error) throw error;

      if (data?.extractedData) {
        onDataExtracted(data.extractedData);
        toast({
          title: "Data extracted successfully",
          description: "Form fields have been populated",
        });
        setTranscribedText('');
        onTextTranscribed?.('');
      }
    } catch (error) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis failed",
        description: "Could not extract data from text",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button 
          variant="outline" 
          className="w-full justify-between h-9 px-3 border-border/40 hover:bg-accent hover:text-accent-foreground"
        >
          <div className="flex items-center gap-2">
            <Mic className="h-4 w-4" />
            <span className="text-sm">Voice Input (Smart Chunks)</span>
            {isRecording && (
              <span className="text-xs text-destructive font-medium">● Recording</span>
            )}
            {isProcessing && (
              <span className="text-xs text-primary font-medium">Processing...</span>
            )}
          </div>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
      </CollapsibleTrigger>
      
      <CollapsibleContent className="space-y-3 pt-3">
        <div className="flex gap-2">
          <Button
            onClick={isRecording ? stopRecording : startRecording}
            variant={isRecording ? "destructive" : "default"}
            disabled={isProcessing}
            className="flex-1"
          >
            {isRecording ? (
              <>
                <MicOff className="h-4 w-4 mr-2" />
                Stop Recording
              </>
            ) : (
              <>
                <Mic className="h-4 w-4 mr-2" />
                Start Recording
              </>
            )}
          </Button>
        </div>

        {transcribedText && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Transcribed Text:</label>
            <Textarea
              value={transcribedText}
              onChange={(e) => {
                setTranscribedText(e.target.value);
                onTextTranscribed?.(e.target.value);
              }}
              placeholder="Transcribed text will appear here..."
              className="min-h-[100px] resize-none"
            />
            <div className="flex justify-between items-center">
              <span className="text-xs text-muted-foreground">
                {transcribedText.length} characters
              </span>
              <div className="flex gap-2">
                <Button
                  onClick={() => {
                    setTranscribedText('');
                    onTextTranscribed?.('');
                  }}
                  variant="outline"
                  size="sm"
                >
                  Clear
                </Button>
                <Button
                  onClick={handleAnalyze}
                  disabled={isProcessing || !transcribedText.trim()}
                  size="sm"
                >
                  {isProcessing ? 'Processing...' : 'Extract Data'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};

export default RealtimeVoiceInput;