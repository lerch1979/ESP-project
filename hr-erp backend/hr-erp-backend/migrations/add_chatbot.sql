-- Chatbot tables for script-based knowledge base Q&A system
-- Run: psql -U postgres -d hr_erp_db -f migrations/add_chatbot.sql

-- ============================================================================
-- 1. FAQ Categories
-- ============================================================================
CREATE TABLE IF NOT EXISTS chatbot_faq_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'help',
  color VARCHAR(7) DEFAULT '#3b82f6',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chatbot_faq_categories_contractor ON chatbot_faq_categories(contractor_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_faq_categories_slug ON chatbot_faq_categories(slug);
CREATE INDEX IF NOT EXISTS idx_chatbot_faq_categories_active ON chatbot_faq_categories(is_active);

-- ============================================================================
-- 2. Knowledge Base (Q&A pairs with keyword matching)
-- ============================================================================
CREATE TABLE IF NOT EXISTS chatbot_knowledge_base (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
  category_id UUID REFERENCES chatbot_faq_categories(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  keywords TEXT[] DEFAULT '{}',
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chatbot_kb_contractor ON chatbot_knowledge_base(contractor_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_kb_category ON chatbot_knowledge_base(category_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_kb_active ON chatbot_knowledge_base(is_active);
CREATE INDEX IF NOT EXISTS idx_chatbot_kb_keywords ON chatbot_knowledge_base USING GIN(keywords);

-- ============================================================================
-- 3. Decision Trees
-- ============================================================================
CREATE TABLE IF NOT EXISTS chatbot_decision_trees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  trigger_keywords TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chatbot_dt_contractor ON chatbot_decision_trees(contractor_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_dt_active ON chatbot_decision_trees(is_active);
CREATE INDEX IF NOT EXISTS idx_chatbot_dt_keywords ON chatbot_decision_trees USING GIN(trigger_keywords);

-- ============================================================================
-- 4. Decision Nodes (self-referential tree structure)
-- ============================================================================
CREATE TABLE IF NOT EXISTS chatbot_decision_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tree_id UUID NOT NULL REFERENCES chatbot_decision_trees(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES chatbot_decision_nodes(id) ON DELETE CASCADE,
  node_type VARCHAR(20) NOT NULL CHECK (node_type IN ('root', 'question', 'option', 'answer')),
  content TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chatbot_dn_tree ON chatbot_decision_nodes(tree_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_dn_parent ON chatbot_decision_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_dn_type ON chatbot_decision_nodes(node_type);

-- ============================================================================
-- 5. Conversations
-- ============================================================================
CREATE TABLE IF NOT EXISTS chatbot_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID REFERENCES contractors(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) DEFAULT 'Új beszélgetés',
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'escalated', 'closed')),
  current_tree_id UUID REFERENCES chatbot_decision_trees(id) ON DELETE SET NULL,
  current_node_id UUID REFERENCES chatbot_decision_nodes(id) ON DELETE SET NULL,
  escalation_ticket_id UUID REFERENCES tickets(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_chatbot_conv_contractor ON chatbot_conversations(contractor_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_user ON chatbot_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_conv_status ON chatbot_conversations(status);

-- ============================================================================
-- 6. Messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS chatbot_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chatbot_conversations(id) ON DELETE CASCADE,
  sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'bot', 'system')),
  message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'options', 'faq_list', 'escalation')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chatbot_msg_conversation ON chatbot_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_msg_sender ON chatbot_messages(sender_type);
CREATE INDEX IF NOT EXISTS idx_chatbot_msg_created ON chatbot_messages(created_at);

-- ============================================================================
-- 7. Bot Config (per-contractor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS chatbot_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID UNIQUE REFERENCES contractors(id) ON DELETE CASCADE,
  welcome_message TEXT DEFAULT 'Üdvözlöm! Miben segíthetek? Írja le kérdését, vagy válasszon az alábbi témák közül.',
  fallback_message TEXT DEFAULT 'Sajnos nem találtam megfelelő választ. Szeretné, ha továbbítanám kérdését egy munkatársunknak?',
  escalation_message TEXT DEFAULT 'Kérdését továbbítottam munkatársainknak. Hamarosan felvesszük Önnel a kapcsolatot egy hibajegyen keresztül.',
  keyword_threshold INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chatbot_config_contractor ON chatbot_config(contractor_id);

-- ============================================================================
-- Updated_at triggers
-- ============================================================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT unnest(ARRAY[
      'chatbot_faq_categories',
      'chatbot_knowledge_base',
      'chatbot_decision_trees',
      'chatbot_decision_nodes',
      'chatbot_conversations',
      'chatbot_config'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS update_%s_updated_at ON %I', tbl, tbl
    );
    EXECUTE format(
      'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', tbl, tbl
    );
  END LOOP;
END $$;
