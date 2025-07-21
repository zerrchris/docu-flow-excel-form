import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const { headers } = req;
    const upgradeHeader = headers.get("upgrade") || "";

    if (upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket connection", { status: 400 });
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error("OpenAI API key not configured");
      return new Response("OpenAI API key not configured", { status: 500 });
    }

    console.log("Starting WebSocket upgrade...");

    const { socket, response } = Deno.upgradeWebSocket(req);
    
    let openAISocket: WebSocket | null = null;
    let sessionCreated = false;

    socket.onopen = () => {
      console.log("Client WebSocket connected");
      
      // Connect to OpenAI Realtime API
      openAISocket = new WebSocket(
        "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01",
        [],
        {
          headers: {
            "Authorization": `Bearer ${openAIApiKey}`,
            "OpenAI-Beta": "realtime=v1"
          }
        }
      );

      openAISocket.onopen = () => {
        console.log("Connected to OpenAI Realtime API");
      };

      openAISocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log("Received from OpenAI:", data.type);

          // Send session.update after receiving session.created
          if (data.type === "session.created" && !sessionCreated) {
            sessionCreated = true;
            console.log("Session created, sending session.update");
            
            const sessionUpdate = {
              type: "session.update",
              session: {
                modalities: ["text", "audio"],
                instructions: "You are a helpful assistant that helps extract information from spoken descriptions of legal documents. Listen carefully and provide accurate transcriptions.",
                voice: "alloy",
                input_audio_format: "pcm16",
                output_audio_format: "pcm16",
                input_audio_transcription: {
                  model: "whisper-1"
                },
                turn_detection: {
                  type: "server_vad",
                  threshold: 0.5,
                  prefix_padding_ms: 300,
                  silence_duration_ms: 1000
                },
                temperature: 0.3,
                max_response_output_tokens: 1000
              }
            };
            
            openAISocket?.send(JSON.stringify(sessionUpdate));
          }

          // Forward relevant events to client
          if (
            data.type === "input_audio_buffer.speech_started" ||
            data.type === "input_audio_buffer.speech_stopped" ||
            data.type === "conversation.item.input_audio_transcription.completed" ||
            data.type === "conversation.item.input_audio_transcription.delta" ||
            data.type === "session.updated" ||
            data.type === "error"
          ) {
            socket.send(JSON.stringify(data));
          }

        } catch (error) {
          console.error("Error parsing OpenAI message:", error);
        }
      };

      openAISocket.onerror = (error) => {
        console.error("OpenAI WebSocket error:", error);
        socket.send(JSON.stringify({
          type: "error",
          error: "OpenAI connection error"
        }));
      };

      openAISocket.onclose = () => {
        console.log("OpenAI WebSocket closed");
        socket.close();
      };
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Received from client:", data.type);

        // Forward audio and control messages to OpenAI
        if (openAISocket && openAISocket.readyState === WebSocket.OPEN) {
          openAISocket.send(event.data);
        }
      } catch (error) {
        console.error("Error parsing client message:", error);
      }
    };

    socket.onclose = () => {
      console.log("Client WebSocket closed");
      openAISocket?.close();
    };

    socket.onerror = (error) => {
      console.error("Client WebSocket error:", error);
      openAISocket?.close();
    };

    return response;
  } catch (error) {
    console.error("Error in realtime-voice function:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});