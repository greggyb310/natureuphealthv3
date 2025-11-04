/*
  # Create Conversations and Messages Tables for AI Assistants

  ## Tables Created
  
  1. **conversations**
    - `id` (uuid, primary key) - Unique conversation identifier
    - `user_id` (uuid, foreign key) - Links to auth.users
    - `assistant_type` (text) - Type of assistant ('health_coach' or 'excursion_creator')
    - `thread_id` (text) - OpenAI thread identifier for conversation continuity
    - `created_at` (timestamptz) - When conversation started
    - `updated_at` (timestamptz) - Last activity timestamp
  
  2. **messages**
    - `id` (uuid, primary key) - Unique message identifier
    - `conversation_id` (uuid, foreign key) - Links to conversations
    - `role` (text) - Message sender ('user' or 'assistant')
    - `content` (text) - Message text content
    - `created_at` (timestamptz) - When message was sent

  ## Security
  
  - RLS enabled on both tables
  - Users can only view/create their own conversations
  - Users can only view messages in their conversations
  - Assistant type is validated via check constraint
  - Message role is validated via check constraint

  ## Important Notes
  
  - Each conversation maintains a persistent OpenAI thread_id
  - Conversations can be resumed across app sessions
  - Messages are ordered chronologically within conversations
  - Updated_at automatically tracks conversation activity
*/

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  assistant_type text NOT NULL CHECK (assistant_type IN ('health_coach', 'excursion_creator')),
  thread_id text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create index for efficient conversation lookups
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_thread_id ON conversations(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- Enable RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policies for conversations
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own conversations"
  ON conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own conversations"
  ON conversations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Policies for messages
CREATE POLICY "Users can view own messages"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create messages in own conversations"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = messages.conversation_id
      AND conversations.user_id = auth.uid()
    )
  );

-- Function to update conversation updated_at timestamp
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations
  SET updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update conversation timestamp when message is added
CREATE TRIGGER update_conversation_on_message
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_conversation_timestamp();