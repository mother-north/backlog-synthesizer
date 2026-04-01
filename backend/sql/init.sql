-- Backlog Synthesizer — Full Database Schema
-- PostgreSQL + pgvector

-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- for fuzzy text search

-- ============================================================
-- Users & Auth
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    roles JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(500) NOT NULL,
    expires_at TIMESTAMP NOT NULL
);

-- ============================================================
-- Roles & Menu Access (RBAC)
-- ============================================================

CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS menu_access (
    id SERIAL PRIMARY KEY,
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    menu_path VARCHAR(255),
    tab_name VARCHAR(255),
    allowed BOOLEAN DEFAULT TRUE
);

-- ============================================================
-- Meetings
-- ============================================================

CREATE TABLE IF NOT EXISTS meetings (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500),
    transcript TEXT NOT NULL,
    transcript_tsvector tsvector,
    file_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'processing',  -- processing | in_review | completed
    meeting_quality JSONB,
    pipeline_progress JSONB,
    uploaded_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Auto-update tsvector on insert/update
CREATE OR REPLACE FUNCTION meetings_tsvector_trigger() RETURNS trigger AS $$
BEGIN
  NEW.transcript_tsvector := to_tsvector('english', COALESCE(NEW.transcript, ''));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tsvector_update ON meetings;
CREATE TRIGGER tsvector_update BEFORE INSERT OR UPDATE ON meetings
    FOR EACH ROW EXECUTE FUNCTION meetings_tsvector_trigger();

CREATE INDEX IF NOT EXISTS idx_meetings_tsvector ON meetings USING gin (transcript_tsvector);

-- ============================================================
-- Backlog Items (uploaded via UI)
-- ============================================================

CREATE TABLE IF NOT EXISTS backlog_items (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(50),
    type VARCHAR(50),                  -- epic | story | bug | improvement | task
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50),                -- backlog | in_progress | done | blocked
    epic_id VARCHAR(50),               -- parent epic external_id
    priority VARCHAR(20),              -- critical | high | medium | low
    labels JSONB,
    acceptance_criteria JSONB,
    dependencies JSONB,
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Architecture Documents (uploaded via UI)
-- ============================================================

CREATE TABLE IF NOT EXISTS architecture_docs (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255),
    content TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Epics
-- ============================================================

CREATE TABLE IF NOT EXISTS epics (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(50),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    is_proposed BOOLEAN DEFAULT FALSE,
    proposed_by_meeting INTEGER REFERENCES meetings(id),
    proposal_justification TEXT,
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP
);

-- ============================================================
-- Stories
-- ============================================================

CREATE TABLE IF NOT EXISTS stories (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    epic_id INTEGER REFERENCES epics(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    type VARCHAR(50),
    acceptance_criteria JSONB,
    feature_tags JSONB,
    priority_signals JSONB,
    confidence VARCHAR(10),
    source_citation TEXT,
    status VARCHAR(50) DEFAULT 'generated',
    original_content JSONB,
    grounding_status VARCHAR(20),      -- valid | warning | invalid
    grounding_issues JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    confirmed_at TIMESTAMP,
    confirmed_by INTEGER REFERENCES users(id)
);

-- ============================================================
-- Checks
-- ============================================================

CREATE TABLE IF NOT EXISTS checks (
    id SERIAL PRIMARY KEY,
    story_id INTEGER REFERENCES stories(id) ON DELETE CASCADE,
    check_type VARCHAR(50),
    details TEXT,
    proposed_resolution TEXT,
    routed_to VARCHAR(50),
    status VARCHAR(50) DEFAULT 'open',
    resolved_by INTEGER REFERENCES users(id),
    resolution_notes TEXT,
    resolved_at TIMESTAMP
);

-- ============================================================
-- Decisions
-- ============================================================

CREATE TABLE IF NOT EXISTS decisions (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    story_id INTEGER REFERENCES stories(id),
    epic_id INTEGER REFERENCES epics(id),
    decision_type VARCHAR(50),
    rationale TEXT,
    decided_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Memos
-- ============================================================

CREATE TABLE IF NOT EXISTS memos (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    version INTEGER DEFAULT 1,
    content TEXT,
    generated_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Backlog Hygiene Flags
-- ============================================================

CREATE TABLE IF NOT EXISTS backlog_hygiene_flags (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    external_item_id VARCHAR(50),
    flag_type VARCHAR(50),
    reason TEXT,
    source_citation TEXT,
    status VARCHAR(50) DEFAULT 'open',
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Agent Traces (audit)
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_traces (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    agent_name VARCHAR(50),
    input_summary JSONB,
    output_summary JSONB,
    llm_model VARCHAR(50),
    llm_prompt_tokens INTEGER,
    llm_completion_tokens INTEGER,
    duration_ms INTEGER,
    errors JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Entity Audit Log
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    action VARCHAR(50),
    old_value JSONB,
    new_value JSONB,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- ============================================================
-- Knowledge Base Embeddings (pgvector)
-- ============================================================

CREATE TABLE IF NOT EXISTS kb_embeddings (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(50),
    content_id INTEGER,
    content_text TEXT,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_kb_embeddings_cosine ON kb_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_stories_meeting ON stories(meeting_id);
CREATE INDEX IF NOT EXISTS idx_stories_status ON stories(status);
CREATE INDEX IF NOT EXISTS idx_checks_story ON checks(story_id);
CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_meeting ON agent_traces(meeting_id);
CREATE INDEX IF NOT EXISTS idx_decisions_meeting ON decisions(meeting_id);
CREATE INDEX IF NOT EXISTS idx_backlog_items_external ON backlog_items(external_id);
