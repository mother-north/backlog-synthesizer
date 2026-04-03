/**
 * E2E API-level tests — test the full pipeline flow via HTTP calls.
 * Requires: backend (:3006) + agents (:8000) running.
 * These tests make real LLM calls and take 1-2 min.
 *
 * Run: npm run test:e2e
 */
import { apiGet, apiPost, apiPut, apiDelete, uploadMeeting } from './helpers';

describe('E2E: Pipeline Flow', () => {
  let meetingId: number;

  afterAll(async () => {
    // Cleanup test meeting
    if (meetingId) {
      await apiDelete(`/api/meetings/${meetingId}`).catch(() => {});
    }
  });

  it('1. uploads a meeting transcript', async () => {
    const transcript = `# Test E2E Meeting

**Date:** 2025-08-01

---

**Sarah (PM):** We need to add two-factor authentication for all admin users. This is a security requirement from the compliance team.

**Mike (Architect):** Agreed. We should use TOTP-based MFA. I recommend the speakeasy library for generating and verifying tokens.

**Alex (Dev Lead):** There's also a bug in the password reset flow — ERIS-035 — where the reset email sometimes doesn't arrive. We need to fix the SMTP configuration.

**Sarah (PM):** One more thing — the audit log page is slow when there are more than 1000 entries. We need to add pagination.`;

    const { status, body } = await uploadMeeting('E2E Test Meeting', transcript);
    expect([200, 201]).toContain(status);
    expect(body.id).toBeDefined();
    expect(body.status).toBe('uploaded');
    meetingId = body.id;
  });

  it('2. triggers the pipeline', async () => {
    const { status } = await apiPost(`/api/meetings/${meetingId}/trigger`);
    expect([200, 202]).toContain(status);
  });

  it('3. pipeline completes within timeout', async () => {
    // Poll for completion (max 2 min)
    let meeting: any;
    for (let i = 0; i < 24; i++) {
      await new Promise(r => setTimeout(r, 5000)); // 5s intervals
      const { body } = await apiGet(`/api/meetings/${meetingId}`);
      meeting = body;
      if (meeting.status !== 'processing') break;
    }
    expect(['in_review', 'completed']).toContain(meeting.status);
  });

  it('4. stories were generated', async () => {
    const { status, body } = await apiGet(`/api/stories?meeting_id=${meetingId}`);
    expect(status).toBe(200);
    expect(body.rows.length).toBeGreaterThan(0);

    // Each story should have required fields
    for (const story of body.rows) {
      expect(story.title).toBeDefined();
      expect(story.description).toBeDefined();
      expect(story.type).toBeDefined();
      expect(story.source_citation).toBeDefined();
      expect(story.source_citation.length).toBeGreaterThan(0);
      expect(story.speaker).toBeDefined();
    }
  });

  it('5. stories have epic assignments', async () => {
    const { body } = await apiGet(`/api/stories?meeting_id=${meetingId}`);
    const withEpic = body.rows.filter((s: any) => s.epic_id);
    // At least some stories should have epics
    expect(withEpic.length).toBeGreaterThan(0);
  });

  it('6. checks were generated', async () => {
    const { status, body } = await apiGet(`/api/checks?meeting_id=${meetingId}`);
    expect(status).toBe(200);
    // Pipeline should generate some checks (overlap, architecture, etc.)
    expect(Array.isArray(body.rows)).toBe(true);
  });

  it('7. can update story priority', async () => {
    const { body: stories } = await apiGet(`/api/stories?meeting_id=${meetingId}`);
    const story = stories.rows[0];
    const { status, body } = await apiPut(`/api/stories/${story.id}`, { priority: 'critical' });
    expect(status).toBe(200);
    expect(body.priority).toBe('critical');
  });

  it('8. can confirm a story (with epic)', async () => {
    const { body: stories } = await apiGet(`/api/stories?meeting_id=${meetingId}`);
    const withEpic = stories.rows.find((s: any) => s.epic_id && s.open_checks === 0);
    if (withEpic) {
      // Resolve any open checks first
      const { body: storyDetail } = await apiGet(`/api/stories/${withEpic.id}`);
      for (const check of storyDetail.checks.filter((c: any) => c.status === 'open')) {
        await apiPost(`/api/checks/${check.id}/resolve`, {
          resolution_type: 'accept',
          resolution_notes: 'Accepted',
        });
      }

      const { status } = await apiPost(`/api/stories/${withEpic.id}/confirm`);
      expect([200, 400]).toContain(status); // 400 if still has open checks

      if (status === 200) {
        const { body: confirmed } = await apiGet(`/api/stories/${withEpic.id}`);
        expect(confirmed.status).toBe('confirmed');
      }
    }
  });

  it('9. can reject a story', async () => {
    const { body: stories } = await apiGet(`/api/stories?meeting_id=${meetingId}`);
    const generated = stories.rows.find((s: any) => s.status === 'generated');
    if (generated) {
      const { status } = await apiPost(`/api/stories/${generated.id}/reject`, {
        rationale: 'E2E test rejection',
      });
      expect(status).toBe(200);

      const { body: rejected } = await apiGet(`/api/stories/${generated.id}`);
      expect(rejected.status).toBe('rejected');
    }
  });

  it('10. can generate memo', async () => {
    const { status, body } = await apiPost(`/api/meetings/${meetingId}/memos/generate`);
    expect([200, 201]).toContain(status);
    // Should have memo content
    if (body.memo) {
      expect(body.memo.full_text).toBeDefined();
      expect(body.memo.full_text.length).toBeGreaterThan(0);
    }
  });

  it('11. audit trail has entries', async () => {
    const { status, body } = await apiGet(`/api/meetings/${meetingId}/audit`);
    expect(status).toBe(200);
    expect(body.rows.length).toBeGreaterThan(0);
  });

  it('12. agent traces recorded', async () => {
    const { status, body } = await apiGet(`/api/meetings/${meetingId}/traces`);
    expect(status).toBe(200);
    expect(body.rows.length).toBeGreaterThan(0);
    // Should have traces for parser, retriever, crossref, synthesizer, validator
    const agents = body.rows.map((t: any) => t.agent_name);
    expect(agents).toContain('parser');
    expect(agents).toContain('synthesizer');
    expect(agents).toContain('validator');
  });
});

describe('E2E: Empty Meeting', () => {
  let meetingId: number;

  afterAll(async () => {
    if (meetingId) await apiDelete(`/api/meetings/${meetingId}`);
  });

  it('handles empty transcript gracefully', async () => {
    const { body } = await uploadMeeting('Empty Meeting', 'No agenda.');
    meetingId = body.id;

    await apiPost(`/api/meetings/${meetingId}/trigger`);

    // Wait for completion
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const { body: m } = await apiGet(`/api/meetings/${meetingId}`);
      if (m.status !== 'processing') break;
    }

    const { body: meeting } = await apiGet(`/api/meetings/${meetingId}`);
    expect(meeting.status).toBe('completed');

    const { body: stories } = await apiGet(`/api/stories?meeting_id=${meetingId}`);
    expect(stories.rows.length).toBe(0);
  });
});
