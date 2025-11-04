import { useState, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, Text, ActivityIndicator } from 'react-native';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';
import { assistantsAPI, type AssistantType, type UserContext, type ChatMessage as ChatMessageType } from '@/lib/assistants-api';
import { colors } from '@/lib/colors';

interface ChatInterfaceProps {
  assistantType: AssistantType;
  conversationId?: string;
  userContext?: UserContext;
  onConversationCreated?: (conversationId: string) => void;
}

export function ChatInterface({
  assistantType,
  conversationId: initialConversationId,
  userContext,
  onConversationCreated
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    if (initialConversationId) {
      loadMessages(initialConversationId);
    } else {
      setIsLoading(false);
    }
  }, [initialConversationId]);

  const loadMessages = async (convId: string) => {
    try {
      setIsLoading(true);
      setError(null);
      const msgs = await assistantsAPI.getMessages(convId);
      setMessages(msgs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load messages');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    setError(null);

    const optimisticMessage: ChatMessageType = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId || 'pending',
      role: 'user',
      content: message,
      created_at: new Date().toISOString(),
    };

    setMessages(prev => [...prev, optimisticMessage]);

    try {
      const response = await assistantsAPI.sendMessage(
        assistantType,
        message,
        conversationId,
        userContext
      );

      if (!conversationId) {
        setConversationId(response.conversationId);
        onConversationCreated?.(response.conversationId);
      }

      const updatedMessages = await assistantsAPI.getMessages(response.conversationId);
      setMessages(updatedMessages);

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message');
      setMessages(prev => prev.filter(msg => msg.id !== optimisticMessage.id));
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading conversation...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ChatMessage message={item} />}
        contentContainerStyle={styles.messagesList}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>
              {assistantType === 'health_coach'
                ? 'Start a conversation with your Health Coach'
                : 'Ask me to create a personalized excursion for you'}
            </Text>
          </View>
        }
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      <ChatInput onSend={handleSendMessage} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6B7280',
  },
  messagesList: {
    paddingVertical: 16,
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 16,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 24,
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
  },
  errorText: {
    color: '#991B1B',
    fontSize: 14,
  },
});
