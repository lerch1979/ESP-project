-- ============================================================================
-- Migration 071: NLP Sentiment Analysis
-- AI-powered pulse note analysis for crisis detection
-- FEATURE DISABLED BY DEFAULT — admin must enable after GDPR consent ready
-- ============================================================================

-- Sentiment analysis results
CREATE TABLE IF NOT EXISTS wellbeing_sentiment_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contractor_id UUID REFERENCES contractors(id),
  pulse_id UUID,
  pulse_note TEXT NOT NULL,
  sentiment VARCHAR(50) NOT NULL,
  confidence DECIMAL(3,2) NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  keywords JSONB DEFAULT '[]',
  urgency VARCHAR(20) NOT NULL DEFAULT 'low',
  recommended_action TEXT,
  escalated BOOLEAN DEFAULT false,
  escalated_at TIMESTAMP,
  escalated_by UUID REFERENCES users(id),
  review_notes TEXT,
  analyzed_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Feature flag config per contractor (DISABLED by default)
CREATE TABLE IF NOT EXISTS nlp_sentiment_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id UUID REFERENCES contractors(id) UNIQUE,
  enabled BOOLEAN DEFAULT false,
  require_user_consent BOOLEAN DEFAULT true,
  auto_escalate_critical BOOLEAN DEFAULT true,
  auto_escalate_high BOOLEAN DEFAULT false,
  confidence_threshold DECIMAL(3,2) DEFAULT 0.80,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User consent for NLP analysis
CREATE TABLE IF NOT EXISTS user_nlp_consent (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  contractor_id UUID REFERENCES contractors(id),
  consented BOOLEAN DEFAULT false,
  consent_date TIMESTAMP,
  consent_withdrawn_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sentiment_user ON wellbeing_sentiment_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_sentiment_contractor ON wellbeing_sentiment_analysis(contractor_id);
CREATE INDEX IF NOT EXISTS idx_sentiment_urgency ON wellbeing_sentiment_analysis(urgency);
CREATE INDEX IF NOT EXISTS idx_sentiment_escalated ON wellbeing_sentiment_analysis(escalated);
CREATE INDEX IF NOT EXISTS idx_sentiment_date ON wellbeing_sentiment_analysis(analyzed_at);
CREATE INDEX IF NOT EXISTS idx_sentiment_pulse ON wellbeing_sentiment_analysis(pulse_id);
CREATE INDEX IF NOT EXISTS idx_nlp_consent_user ON user_nlp_consent(user_id);
CREATE INDEX IF NOT EXISTS idx_nlp_config_contractor ON nlp_sentiment_config(contractor_id);
