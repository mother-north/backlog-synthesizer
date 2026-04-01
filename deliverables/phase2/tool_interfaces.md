# Tool Interfaces: Backlog Synthesizer

All tools are modular abstractions reading from PostgreSQL. Data is uploaded via the UI (Data Loading pages) and stored in the database. Tools never read from files directly — they always query the database. Designed for future replacement with real integrations (JIRA API, Confluence API, etc.).

## Tool 1: Transcript Reader

**File:** `agents/tools/transcript.py`
**Used by:** Agent 1 (Parser)

```python
class TranscriptReader:
    """Read meeting transcript from file or database."""
    
    def read(self, meeting_id: int) -> TranscriptResult:
        """
        Input:  meeting_id (from meetings table)
        Output: TranscriptResult
        
        Current: reads from PostgreSQL meetings.transcript
        Future:  could fetch from Confluence, Google Docs, etc.
        """

@dataclass
class TranscriptResult:
    meeting_id: int
    title: str
    raw_text: str          # full transcript content
    word_count: int
    is_empty: bool         # True if < 10 actionable words
```

**Data source mapping:**
| Current | Future (real integration) |
|---|---|
| PostgreSQL `meetings.transcript` (uploaded via UI) | Confluence API, Google Docs API |

---

## Tool 2: Architecture Reader

**File:** `agents/tools/architecture.py`
**Used by:** Agent 3 (Cross-Reference), Agent 2 (Context Retrieval)

```python
class ArchitectureReader:
    """Read architecture document, split into searchable sections."""
    
    def get_full_doc(self) -> str:
        """Return the full architecture document as text."""
    
    def get_sections(self) -> list[ArchitectureSection]:
        """Return architecture doc split into semantic sections."""
    
    def get_constraints(self) -> list[Constraint]:
        """Extract explicit constraints from the architecture doc."""

@dataclass
class ArchitectureSection:
    title: str             # e.g., "Database Schema", "API Contracts"
    content: str           # section text
    components: list[str]  # system components mentioned

@dataclass
class Constraint:
    description: str       # e.g., "SQLite single-writer limitation"
    component: str         # e.g., "database"
    source_text: str       # exact text from architecture doc
```

**Data source mapping:**
| Current (mocked) | Future (real) |
|---|---|
| PostgreSQL `architecture_docs` table (uploaded via UI) | Confluence wiki export API, Git repo README |

---

## Tool 3: Backlog Reader

**File:** `agents/tools/backlog.py`
**Used by:** Agent 2 (Context Retrieval), Agent 3 (Cross-Reference)

```python
class BacklogReader:
    """Read current backlog items."""
    
    def get_all_items(self) -> list[BacklogItem]:
        """Return all backlog items."""
    
    def get_epics(self) -> list[BacklogItem]:
        """Return only epics."""
    
    def get_items_by_epic(self, epic_id: str) -> list[BacklogItem]:
        """Return items under a specific epic."""
    
    def search(self, query: str, limit: int = 10) -> list[BacklogItem]:
        """Search backlog items by text similarity."""

@dataclass
class BacklogItem:
    id: str                          # e.g., "ERIS-001"
    type: str                        # epic | story | bug | improvement | task
    title: str
    description: str | None
    status: str                      # backlog | in_progress | done | blocked
    epic_id: str | None
    priority: str                    # critical | high | medium | low
    labels: list[str]
    acceptance_criteria: list[str]
    dependencies: list[str]
```

**Data source mapping:**
| Current (mocked) | Future (real) |
|---|---|
| PostgreSQL `backlog_items` table (uploaded via UI) | JIRA REST API, GitHub Issues API, Azure DevOps API |

---

## Tool 4: Knowledge Base

**File:** `agents/tools/kb.py`
**Used by:** Agent 2 (Context Retrieval — read), Agent 5 (Memo — write)

```python
class KnowledgeBase:
    """Read/write to the knowledge base (PostgreSQL + pgvector)."""
    
    # --- Read operations (Agent 2) ---
    
    def search_similar(
        self, 
        query: str, 
        content_types: list[str] = None,  # meeting_summary, decision, story, architecture
        limit: int = 10
    ) -> list[KBResult]:
        """Semantic search via pgvector cosine similarity."""
    
    def search_decisions(
        self,
        keywords: list[str],
        meeting_ids: list[int] = None
    ) -> list[Decision]:
        """Search prior decisions by keywords, optionally scoped to meetings."""
    
    def search_feedback(
        self,
        story_title: str,
        story_type: str
    ) -> list[FeedbackResult]:
        """Search prior rejections/modifications for similar stories."""
    
    def full_text_search(
        self,
        query: str,
        table: str = "meetings"
    ) -> list[dict]:
        """PostgreSQL full-text search on raw transcripts/memos."""
    
    # --- Write operations (Agent 5) ---
    
    def store_meeting_summary(self, meeting_id: int, summary: str) -> None:
        """Store meeting summary with embedding in kb_embeddings."""
    
    def store_decisions(self, decisions: list[Decision]) -> None:
        """Store confirmed decisions with embeddings."""
    
    def store_story_embedding(self, story_id: int, story_text: str) -> None:
        """Store story text with embedding for future retrieval."""

@dataclass
class KBResult:
    content_type: str      # meeting_summary | decision | story | architecture
    content_text: str
    similarity: float      # 0.0 to 1.0
    metadata: dict         # meeting_id, date, etc.

@dataclass
class Decision:
    id: int
    meeting_id: int
    story_id: int | None
    decision_type: str     # confirmed | rejected | modified | epic_approved
    rationale: str
    decided_by: int
    created_at: str

@dataclass
class FeedbackResult:
    decision_type: str     # rejected | modified
    rationale: str
    original_story_title: str
    meeting_id: int
    similarity: float
```

**Data source mapping:**
| Current (mocked) | Future (real) |
|---|---|
| PostgreSQL + pgvector (local or Azure) | Same — KB is always internal |

---

## Tool Interface Pattern

Tools use **abstract base classes**. Agents depend on the interface, never on the implementation. Swapping from database to a real API means writing a new class, not changing agent code.

```python
from abc import ABC, abstractmethod

# ─── Abstract interfaces (agents depend on these) ───

class IArchitectureSource(ABC):
    @abstractmethod
    def get_full_doc(self) -> str: ...
    @abstractmethod
    def get_sections(self) -> list[ArchitectureSection]: ...
    @abstractmethod
    def get_constraints(self) -> list[Constraint]: ...

class IBacklogSource(ABC):
    @abstractmethod
    def get_all_items(self) -> list[BacklogItem]: ...
    @abstractmethod
    def get_epics(self) -> list[BacklogItem]: ...
    @abstractmethod
    def get_items_by_epic(self, epic_id: str) -> list[BacklogItem]: ...
    @abstractmethod
    def search(self, query: str, limit: int = 10) -> list[BacklogItem]: ...

# ─── Current implementations (PostgreSQL, data uploaded via UI) ───

class PgArchitectureSource(IArchitectureSource):
    """Reads architecture doc from PostgreSQL architecture_docs table."""
    def __init__(self, db: Database):
        self.db = db
    def get_full_doc(self) -> str:
        return self.db.query("SELECT content FROM architecture_docs ORDER BY uploaded_at DESC LIMIT 1")
    # ...

class PgBacklogSource(IBacklogSource):
    """Reads backlog items from PostgreSQL backlog_items table."""
    def __init__(self, db: Database):
        self.db = db
    def get_all_items(self) -> list[BacklogItem]:
        return self.db.query("SELECT * FROM backlog_items")
    # ...

# ─── Future implementations (swap in without changing agents) ───

class ConfluenceArchitectureSource(IArchitectureSource):
    """Reads architecture doc from Confluence wiki API."""
    def __init__(self, confluence_client, page_id: str):
        self.client = confluence_client
        self.page_id = page_id
    def get_full_doc(self) -> str:
        return self.client.get_page_content(self.page_id)
    # ...

class JiraBacklogSource(IBacklogSource):
    """Reads backlog items from JIRA REST API."""
    def __init__(self, jira_client, project_key: str):
        self.client = jira_client
        self.project_key = project_key
    def get_all_items(self) -> list[BacklogItem]:
        return self.client.search_issues(f"project={self.project_key}")
    # ...

# ─── Dependency injection (configured at startup) ───

def create_tools(config):
    db = Database(config.database_url)
    
    if config.architecture_source == "postgres":
        architecture = PgArchitectureSource(db)
    elif config.architecture_source == "confluence":
        architecture = ConfluenceArchitectureSource(confluence_client, config.confluence_page_id)
    
    if config.backlog_source == "postgres":
        backlog = PgBacklogSource(db)
    elif config.backlog_source == "jira":
        backlog = JiraBacklogSource(jira_client, config.jira_project_key)
    
    return Tools(
        transcript=TranscriptReader(db),    # always from DB (uploaded via UI)
        architecture=architecture,
        backlog=backlog,
        kb=KnowledgeBase(db),              # always PostgreSQL + pgvector
    )
```

**Key principle:** Agents receive tool interfaces (`IArchitectureSource`, `IBacklogSource`), never concrete classes. The `create_tools()` factory decides which implementation to use based on configuration. Changing from database to JIRA/Confluence is a config change + new implementation class — zero agent code changes.

---

## Data Flow: Tools in Pipeline

```
Agent 1 (Parser)
  └── TranscriptReader.read(meeting_id) → raw transcript text

Agent 2 (Context Retrieval)
  ├── KnowledgeBase.search_similar(requirement) → prior meetings, decisions
  ├── KnowledgeBase.search_feedback(story) → prior rejections/edits
  ├── BacklogReader.search(requirement) → related backlog items
  └── ArchitectureReader.get_sections() → relevant architecture sections

Agent 3 (Cross-Reference)
  ├── BacklogReader.get_all_items() → full backlog for overlap detection
  ├── BacklogReader.get_epics() → existing epics for mapping
  └── ArchitectureReader.get_constraints() → constraints for violation check

Agent 4 (Synthesis)
  └── (no direct tool calls — works from Agent 1-3 outputs)

Validator
  └── TranscriptReader.read(meeting_id) → re-read transcript for citation checking

Agent 5 (Memo)
  ├── KnowledgeBase.store_meeting_summary()
  ├── KnowledgeBase.store_decisions()
  └── KnowledgeBase.store_story_embedding()
```

---

## AI Prompts Used

**Session 2.2 — Tool Interface Design (AI Build)**

Prompt: "Design modular tool interfaces for the 4 tools (transcript, architecture, backlog, KB). Each must be swappable for real integrations."

Key decisions:
- All tools take a DB connection, never called directly by agents without abstraction
- Read/write separation on KB tool (only Agent 5 writes)
- BacklogReader has search() for semantic matching, not just get_all()
- ArchitectureReader splits doc into sections and extracts constraints separately
- FeedbackResult in KB enables the feedback loop (prior rejections surfaced)

**Session 2.2 — Tool Review (AI Review)**

Validated: every tool maps to a data source, every agent maps to tools it needs, swapping to real integrations requires only tool reimplementation.
