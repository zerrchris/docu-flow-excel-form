import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

serve(async (req) => {
  return new Response(JSON.stringify({ message: "Hello from customer-portal!" }), {
    headers: { "Content-Type": "application/json" },
    status: 200,
  });
});