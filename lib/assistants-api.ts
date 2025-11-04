import { supabase } from './supabase';

export type AssistantType = 'health_coach' | 'excursion_creator';

export interface UserContext {
  healthGoals?: string[];
  mobilityLevel?: string;
  preferredActivities?: string[];
  location?: {
    lat: number;
    lng: number;
    address?: string;
  };
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  assistant_type: AssistantType;
  thread_id: string;
  created_at: string;
  updated_at: string;
}

export interface ChatResponse {
  response: string;
  conversationId: string;
  threadId: string;
}

class AssistantsAPI {
  private getEdgeFunctionUrl(assistantType: AssistantType): string {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!supabaseUrl) {
      throw new Error('Supabase URL not configured');
    }

    const functionName = assistantType === 'health_coach'
      ? 'health-coach-assistant'
      : 'excursion-creator-assistant';

    return `${supabaseUrl}/functions/v1/${functionName}`;
  }

  async sendMessage(
    assistantType: AssistantType,
    message: string,
    conversationId?: string,
    userContext?: UserContext
  ): Promise<ChatResponse> {
    const session = await supabase.auth.getSession();
    if (!session.data.session) {
      throw new Error('Not authenticated');
    }

    const url = this.getEdgeFunctionUrl(assistantType);
    const headers = {
      'Authorization': `Bearer ${session.data.session.access_token}`,
      'Content-Type': 'application/json',
    };

    const body = JSON.stringify({
      message,
      conversationId,
      userContext,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to send message');
    }

    return response.json();
  }

  async getConversations(assistantType?: AssistantType): Promise<Conversation[]> {
    let query = supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (assistantType) {
      query = query.eq('assistant_type', assistantType);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch conversations: ${error.message}`);
    }

    return data || [];
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to fetch messages: ${error.message}`);
    }

    return data || [];
  }

  async deleteConversation(conversationId: string): Promise<void> {
    const { error } = await supabase
      .from('conversations')
      .delete()
      .eq('id', conversationId);

    if (error) {
      throw new Error(`Failed to delete conversation: ${error.message}`);
    }
  }
}

export const assistantsAPI = new AssistantsAPI();
