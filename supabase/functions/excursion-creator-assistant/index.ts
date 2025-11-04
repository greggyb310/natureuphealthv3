import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.78.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ExcursionRequest {
  message: string;
  conversationId?: string;
  userContext?: {
    healthGoals?: string[];
    mobilityLevel?: string;
    preferredActivities?: string[];
    location?: {
      lat: number;
      lng: number;
      address?: string;
    };
  };
}

interface ExcursionResponse {
  response: string;
  conversationId: string;
  threadId: string;
  excursionData?: any;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const { message, conversationId, userContext }: ExcursionRequest = await req.json();
    if (!message) {
      throw new Error("Message is required");
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      throw new Error("OpenAI API key not configured");
    }

    let threadId: string;
    let dbConversationId: string;

    if (conversationId) {
      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .select("id, thread_id")
        .eq("id", conversationId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (convError) throw convError;

      if (conversation) {
        threadId = conversation.thread_id;
        dbConversationId = conversation.id;
      } else {
        const threadResponse = await fetch("https://api.openai.com/v1/threads", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
            "OpenAI-Beta": "assistants=v2",
          },
        });

        if (!threadResponse.ok) {
          throw new Error("Failed to create OpenAI thread");
        }

        const thread = await threadResponse.json();
        threadId = thread.id;

        const { data: newConversation, error: createError } = await supabase
          .from("conversations")
          .insert({
            user_id: user.id,
            assistant_type: "excursion_creator",
            thread_id: threadId,
          })
          .select("id")
          .single();

        if (createError) throw createError;
        dbConversationId = newConversation.id;
      }
    } else {
      const threadResponse = await fetch("https://api.openai.com/v1/threads", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2",
        },
      });

      if (!threadResponse.ok) {
        throw new Error("Failed to create OpenAI thread");
      }

      const thread = await threadResponse.json();
      threadId = thread.id;

      const { data: newConversation, error: createError } = await supabase
        .from("conversations")
        .insert({
          user_id: user.id,
          assistant_type: "excursion_creator",
          thread_id: threadId,
        })
        .select("id")
        .single();

      if (createError) throw createError;
      dbConversationId = newConversation.id;
    }

    const { error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: dbConversationId,
        role: "user",
        content: message,
      });

    if (msgError) throw msgError;

    let messageContent = message;
    if (userContext) {
      const contextInfo = [
        userContext.healthGoals?.length ? `Health Goals: ${userContext.healthGoals.join(", ")}` : null,
        userContext.mobilityLevel ? `Mobility Level: ${userContext.mobilityLevel}` : null,
        userContext.preferredActivities?.length ? `Preferred Activities: ${userContext.preferredActivities.join(", ")}` : null,
        userContext.location?.address ? `Location: ${userContext.location.address}` : null,
      ].filter(Boolean);

      if (contextInfo.length > 0) {
        messageContent = `${message}\n\nUser Context:\n${contextInfo.join("\n")}`;
      }
    }

    const addMessageResponse = await fetch(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2",
        },
        body: JSON.stringify({
          role: "user",
          content: messageContent,
        }),
      }
    );

    if (!addMessageResponse.ok) {
      throw new Error("Failed to add message to thread");
    }

    const assistantId = Deno.env.get("EXCURSION_CREATOR_ASSISTANT_ID");
    if (!assistantId) {
      throw new Error("Excursion Creator Assistant ID not configured");
    }

    const runResponse = await fetch(
      `https://api.openai.com/v1/threads/${threadId}/runs`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
          "OpenAI-Beta": "assistants=v2",
        },
        body: JSON.stringify({
          assistant_id: assistantId,
        }),
      }
    );

    if (!runResponse.ok) {
      throw new Error("Failed to run assistant");
    }

    const run = await runResponse.json();

    let runStatus = run.status;
    let attempts = 0;
    const maxAttempts = 30;

    while (runStatus !== "completed" && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await fetch(
        `https://api.openai.com/v1/threads/${threadId}/runs/${run.id}`,
        {
          headers: {
            "Authorization": `Bearer ${openaiApiKey}`,
            "OpenAI-Beta": "assistants=v2",
          },
        }
      );

      if (!statusResponse.ok) {
        throw new Error("Failed to check run status");
      }

      const statusData = await statusResponse.json();
      runStatus = statusData.status;
      attempts++;

      if (runStatus === "failed" || runStatus === "cancelled" || runStatus === "expired") {
        throw new Error(`Assistant run ${runStatus}`);
      }
    }

    if (runStatus !== "completed") {
      throw new Error("Assistant run timed out");
    }

    const messagesResponse = await fetch(
      `https://api.openai.com/v1/threads/${threadId}/messages`,
      {
        headers: {
          "Authorization": `Bearer ${openaiApiKey}`,
          "OpenAI-Beta": "assistants=v2",
        },
      }
    );

    if (!messagesResponse.ok) {
      throw new Error("Failed to retrieve messages");
    }

    const messagesData = await messagesResponse.json();
    const assistantMessage = messagesData.data.find(
      (msg: any) => msg.role === "assistant"
    );

    if (!assistantMessage) {
      throw new Error("No assistant response found");
    }

    const textContent = assistantMessage.content.find(
      (content: any) => content.type === "text"
    );

    if (!textContent) {
      throw new Error("No text content in assistant response");
    }

    const assistantResponse = textContent.text.value;

    const { error: assistantMsgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: dbConversationId,
        role: "assistant",
        content: assistantResponse,
      });

    if (assistantMsgError) throw assistantMsgError;

    const responseData: ExcursionResponse = {
      response: assistantResponse,
      conversationId: dbConversationId,
      threadId: threadId,
    };

    return new Response(JSON.stringify(responseData), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "An unknown error occurred",
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});