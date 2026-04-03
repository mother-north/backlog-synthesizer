"""Shared test fixtures."""
import os
import sys
import pytest

# Add agents dir to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# Set test environment
os.environ.setdefault('PG_HOST', 'localhost')
os.environ.setdefault('PG_PORT', '5432')
os.environ.setdefault('PG_DATABASE', 'backlog_synthesizer_db')
os.environ.setdefault('PG_USER', 'evgeny.ponomarenko')
os.environ.setdefault('PG_PASSWORD', '')


@pytest.fixture
def sample_transcript():
    return """# Test Meeting

**Date:** 2025-07-14

---

**Sarah (PM):** We need to add user authentication to the system. This is critical for launch.

**Mike (Architect):** Agreed. We should use JWT tokens for the API and bcrypt for password hashing.

**Alex (Dev Lead):** I also want to add rate limiting on the login endpoint to prevent brute force attacks.

**Sarah (PM):** One more thing — the dashboard is slow. We need to optimize the database queries.
"""


@pytest.fixture
def sample_requirements():
    from models.story import Requirement, RequirementType, Granularity, Confidence
    return [
        Requirement(
            id="REQ-001",
            description="Add user authentication to the system",
            source_citation="We need to add user authentication to the system. This is critical for launch.",
            speaker="Sarah (PM)",
            type=RequirementType.feature,
            granularity=Granularity.epic,
            confidence=Confidence.high,
        ),
        Requirement(
            id="REQ-002",
            description="Use JWT tokens and bcrypt for password hashing",
            source_citation="We should use JWT tokens for the API and bcrypt for password hashing.",
            speaker="Mike (Architect)",
            type=RequirementType.feature,
            granularity=Granularity.story,
            confidence=Confidence.high,
        ),
        Requirement(
            id="REQ-003",
            description="Add rate limiting on login endpoint",
            source_citation="I also want to add rate limiting on the login endpoint to prevent brute force attacks.",
            speaker="Alex (Dev Lead)",
            type=RequirementType.nfr,
            granularity=Granularity.story,
            confidence=Confidence.high,
        ),
        Requirement(
            id="REQ-004",
            description="Optimize database queries for dashboard performance",
            source_citation="the dashboard is slow. We need to optimize the database queries.",
            speaker="Sarah (PM)",
            type=RequirementType.improvement,
            granularity=Granularity.story,
            confidence=Confidence.medium,
        ),
    ]
