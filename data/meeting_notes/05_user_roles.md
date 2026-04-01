# Meeting Notes — User Roles & Access Control Design

**Date:** 2025-10-14
**Attendees:** Sarah (PM), Mike (Architect), Chris (Product)
**Duration:** 45 minutes
**Location:** Conference Room B / Teams

---

**Sarah (PM):** Alright, so we need to finalize the access control model for ERIS. I know we touched on this during the kickoff, but I've been hearing from a few stakeholders that the current five-role structure might not be the right fit going forward. Chris, you had some feedback from the field?

**Chris (Product):** Yeah, so I've been talking to the export control team at the Dallas site, and they're confused by the distinction between Master Analyst and Analyst. Like, they don't really understand when someone should be one versus the other. And honestly, when I looked at the access-permissions.json, the actual difference in permissions is pretty subtle. Master Analyst can manage prompts and see settings, but in practice everyone on their team does that anyway.

**Mike (Architect):** Hold on, we deliberately set up five roles during the kickoff — Administrator, Master Analyst, Analyst, Export Control, and User. That was a decision. We modeled it after how the compliance department is structured. Changing that now means touching the middleware, the permissions config, the user management UI, all of it.

**Sarah (PM):** I understand, but if the roles don't match how people actually work, then we need to adapt. Chris, what are you proposing exactly?

**Chris (Product):** I think we need five roles, but different ones. Like, instead of Master Analyst and Analyst being separate, we should collapse those into one Analyst role and add a Viewer role for people who just need to see results. So it would be Administrator, Analyst, Reviewer, Viewer, and... hmm, I'm not sure about the fifth one. Maybe a Compliance Officer role?

**Mike (Architect):** Wait, that's still five roles. But you're renaming them and changing what they do. That's not simplification, that's just different complexity.

**Chris (Product):** Right, but it's complexity that maps to how customers actually think about it. Nobody calls themselves a "Master Analyst."

**Sarah (PM):** Mike, what's the technical impact if we restructure the roles?

**Mike (Architect):** Well, the roles are enforced in middleware and configured through access-permissions.json. The actual enforcement code is pretty flexible — it just checks the role string against the permissions map. So changing role names is doable. But migration is the problem. We have existing users assigned to the current roles. We'd need a migration path, and we'd need to figure out what happens to someone who's currently a Master Analyst. Do they become an Analyst? Do they lose access to prompt management?

**Chris (Product):** I think they'd just become Analysts. The prompt management thing... honestly, we might need something more flexible there. Like maybe permissions should be more granular, not just role-based. Where you can toggle individual capabilities per user.

**Mike (Architect):** That's a completely different architecture. Right now it's RBAC — role-based. You're talking about capability-based access control. That's a much bigger change. We'd need to redesign the permissions model, the middleware, the admin UI...

**Sarah (PM):** Let's not get into a full redesign right now. Can we scope this? Chris, is the core ask just about renaming roles, or do you actually need granular permissions?

**Chris (Product):** I mean... probably both? But if I had to pick, the role renaming is more urgent. The granular permissions thing is more of a "nice to have" for when we scale to more teams.

**Mike (Architect):** I'd push back on that. If we're going to change the role model, let's do it right. Three roles is enough — Admin, Analyst, and Viewer. Keep it simple. Most systems I've seen overcomplicate roles and then nobody understands who can do what.

**Sarah (PM):** Three roles? That's a big departure from what we have. Chris just said five, you're saying three. We currently have five. These are three different proposals.

**Mike (Architect):** Three roles covers 90% of use cases. Admin does everything. Analyst evaluates and reviews. Viewer reads. If someone needs a special permission, we handle it as an admin configuration. We're a small team tool, not an enterprise IAM system.

**Chris (Product):** But what about the export control people? They specifically need to review documents but they shouldn't be evaluating new ones. That doesn't fit into your three-role model.

**Mike (Architect):** Fine, then make it four roles. Admin, Analyst, Reviewer, Viewer.

**Chris (Product):** Which is basically what I said, minus the Compliance Officer. But I still think five is the right number because—

**Sarah (PM):** Okay, I think we're going in circles. Let me try to capture where we are. We have three proposals on the table: keep the existing five roles, Chris's alternative five roles, and Mike's three-to-four role simplification. We don't have consensus.

**Mike (Architect):** Can I raise another issue? Whatever we decide on roles, we need to think about the session model. Right now, sessions are stored as files on disk. Each session file has the user's role baked in. If we change roles, we either need to invalidate all sessions or handle a case where a session has a role that doesn't exist anymore.

**Sarah (PM):** That's a good point. How do we handle that?

**Mike (Architect):** Honestly, the simplest thing is to just force everyone to re-login after a role migration. Invalidate all session files. It's a one-time disruption.

**Chris (Product):** That's fine for existing deployments, but what about the user experience? We need to communicate that. And also, when a new deployment goes out, what's the default role set? We should probably make the roles configurable per deployment, not hardcoded.

**Sarah (PM):** Configurable roles per deployment... is that feasible, Mike?

**Mike (Architect):** It's feasible in the sense that the roles are already defined in access-permissions.json, not hardcoded. But the middleware has some role-specific logic — like, the admin check is hardcoded as `role === 'Administrator'` in a few places. We'd need to clean that up. I'd estimate maybe two sprints of work to make roles fully configurable.

**Chris (Product):** Another thing — one of the Dallas customers asked about a "department" concept. Like, they want to restrict analysts to only see documents from their own department. That's not really a role thing, it's more of a scope or tenancy thing. But it came up in the context of roles so I wanted to mention it.

**Sarah (PM):** That sounds like multi-tenancy, which is a whole different conversation. Let's park that for now.

**Mike (Architect):** Agreed. Multi-tenancy with SQLite is... let's just say it's not straightforward.

**Sarah (PM):** So what are our action items? I feel like we don't have a resolution here.

**Chris (Product):** I think we need to survey the actual user base and see what roles they're using. Get data before we make a decision.

**Mike (Architect):** And we need to document the migration impact for each proposal. I can put together a technical impact assessment.

**Sarah (PM):** Okay, so the actions are: Chris does a user role survey, Mike does a technical impact assessment, and we reconvene next week to make a decision. In the meantime, we keep the existing five-role model as-is. Nobody should be building against a new role structure until we decide.

**Chris (Product):** Works for me. But I do want to flag — whatever we decide, we should also think about whether the Viewer role we keep talking about needs access to the review queue or just evaluation results. That's an open question.

**Mike (Architect):** Good point. And we should probably think about what happens with the Export Control role if we drop it. There might be users assigned to it already.

**Sarah (PM):** Added to the open questions list. Let's wrap up.

---

**Open Questions:**
- How many roles should ERIS support? (3, 4, or 5 — no consensus reached)
- Should permissions be role-based or capability-based?
- What's the migration path for existing users if roles change?
- Should roles be configurable per deployment?
- Does the Viewer role need review queue access?
- What happens to users assigned to deprecated roles?

**Action Items:**
- Chris: Conduct user role survey across deployment sites
- Mike: Technical impact assessment for each role restructuring proposal
- Reconvene next week for decision
