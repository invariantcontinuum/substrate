# Staff Engineer / Principal Architect

**The technical champion and gatekeeper.**

---

## Profile

### Firmographics

| Attribute | Profile |
|-----------|---------|
| **Company Size** | Mid-market to enterprise, 200-1000 engineers |
| **Industry** | Any tech-forward (retail, logistics, media, gaming) |
| **Tech Stack** | Legacy + modern (monolith with microservices extraction) |
| **Development Model** | Distributed teams (remote-first, multiple timezones) |
| **Architecture Governance** | Documented in Confluence, but not enforced |

### Budget Authority

| Aspect | Detail |
|--------|--------|
| **Direct Spend** | $0 (must get VP/CTO approval) |
| **Influence** | Recommends tools, runs POCs, presents to leadership |
| **Decision Role** | Technical champion — if they say "no," deal dies |

---

## Pain Points

### Priority 1: "I can't be in every PR — I need to clone myself"

**The Problem:**
- 200+ PRs/week, can only review 20-30 personally
- Junior engineers merging code that violates patterns
- No way to scale architectural knowledge beyond one brain

**The Impact:**
```
Week of Reviews:
- PRs submitted: 250
- Personally reviewed: 25 (10%)
- Architectural violations missed: 18 (72% of violations)
- Post-merge fixes required: 12
```

**Substrate Solution:**
- Automated policy evaluation on every PR
- Human review focused on business logic
- Architectural review scaled to 100% coverage

### Priority 2: "Our architecture docs are stale the moment I write them"

**The Problem:**
- Confluence pages last updated 18 months ago
- Reality has drifted — some services no longer exist
- Can't auto-generate up-to-date architecture diagrams

**The Substrate Difference:**
```
Traditional: You update diagrams → they go stale → nobody trusts them
Substrate: System builds graph from code → always current → source of truth
```

### Priority 3: "Tribal knowledge is walking out the door"

**The Problem:**
- 3 senior engineers left this quarter (30 years combined experience)
- No system for capturing why decisions were made
- New hires re-introduce anti-patterns deprecated 2 years ago

**The WHY Layer:**
```
New Engineer: "Why does PaymentService require the gateway?"
Substrate: ADR-047 + POST-019 + POLICY-012
Time: 5 seconds
Knowledge preserved: Yes
```

### Priority 4: "I need proof my architecture principles are being followed"

**The Problem:**
- Leadership asks: "Are we following clean architecture?"
- Can only answer with spot checks, not systematic verification
- Want to show data: "97% of new services follow the prescribed pattern"

**Substrate Solution:**
- Continuous compliance monitoring
- Policy evaluation on every PR
- Dashboard: "Last 30 days: 98.5% compliance"

---

## Decision Timeline

| Phase | Duration | Activities |
|-------|----------|------------|
| **Technical Validation** | Week 1 | Does it work on our codebase? |
| **Internal Case Building** | Week 2-4 | Quantify problem with current metrics |
| **POC** | Week 5-6 | Deploy on 1-2 services, measure impact |
| **Presentation** | Week 7-8 | Present to VP Eng with before/after data |
| **Committee** | Week 9-12 | VP Eng takes to budget committee |

---

## Compliance Requirements

| Requirement | Status | Notes |
|-------------|--------|-------|
| Read-only access model | ✅ Required | Doesn't modify code without approval |
| Export capability | ✅ Required | Can get graph data out if leaving platform |
| API access | ✅ Required | Wants to build custom scripts on top |
| On-prem option | ⚠️ Nice-to-have | Evaluate locally before cloud |

---

## Success Metrics

### KPIs They Track

| Metric | Current | Target | Why |
|--------|---------|--------|-----|
| % PRs violating architectural rules | 15% | <5% | Quality |
| Time to onboard new engineers | 6 weeks | 3 weeks | Knowledge transfer |
| Architectural drift score | Unknown | Quantified | Visibility |
| Architecture review meetings | 3/week | 1/week | Efficiency |

### Buying Signals

| Signal | Interpretation |
|--------|----------------|
| Asks for "read-only trial" | Wants to see graph without risk |
| Requests technical deep-dive with CTO | Validating architecture |
| Starts documenting pain points for POC | Building internal case |
| Says "I've been wanting this for years" | Strong champion potential |

---

## How They Use Substrate

### Daily Workflow

**Morning:**
1. Check governance dashboard
2. Review overnight violations
3. Triage: auto-fixable vs needs discussion

**During PR Reviews:**
1. Substrate handles architectural validation
2. Human focuses on business logic
3. Discussion on novel patterns, not violations

**Architecture Planning:**
1. Propose change in natural language
2. Simulate impact before writing code
3. Get data on blast radius, policy implications
4. Present proposal with evidence

**Mentoring:**
1. New engineer asks "why" question
2. Query Substrate instead of explaining
3. New engineer learns from linked ADRs

### Favorite Features

| Feature | Use Case | Frequency |
|---------|----------|-----------|
| Policy evaluation log | See what's being caught | Daily |
| Simulation engine | Validate proposed changes | Weekly |
| WHY query | Answer architecture questions | Daily |
| Drift dashboard | Track architectural health | Weekly |
| Blast radius | Impact analysis | Per change |

---

## Value Proposition

### Personal ROI

**Before:**
- 60% of time reviewing PRs for architectural violations
- 20% of time updating stale documentation
- 20% of time on actual architecture work

**With Substrate:**
- 15% of time reviewing (high-value only)
- 5% of time on documentation (system-generated)
- 80% of time on architecture work

**Result:** 4x increase in architectural output

### Team Impact

| Metric | Before | After |
|--------|--------|-------|
| Architectural violations in prod | 12/quarter | 2/quarter (-83%) |
| "Why" questions answered | 20/week (manual) | 50/week (automated) |
| New engineer time-to-productive | 6 weeks | 2 weeks (-67%) |
| Architecture review meetings | 3/week | 0.5/week (-83%) |

---

## Messaging

### Elevator Pitch

> "You can't be in every PR, but your architectural standards can be. Substrate automates the review work you're doing manually — evaluating every PR against your policies, explaining violations with context, and preserving your knowledge so the team can scale beyond you."

### Key Messages

1. **Scale yourself**
   - "Your standards, enforced on every PR"
   - "Review 100% of changes, not 10%"

2. **Preserve your knowledge**
   - "When you explain 'why', it's captured forever"
   - "New engineers learn from your reasoning"

3. **Focus on architecture, not review**
   - "Let the system catch the violations"
   - "Spend time on design, not checking"

4. **Prove your impact**
   - "Show the data: 98% compliance with your standards"
   - "Quantify the architectural health of the org"

---

## Objection Handling

### "I'll lose influence if the system does my job"

**Response:** "You'll gain influence by focusing on strategy instead of syntax. The system catches violations; you design the architecture. Your time spent on high-level design increases 4x."

### "The system won't understand our nuances"

**Response:** "You define the policies in Rego. The system enforces exactly what you specify, consistently, on every PR. No nuance lost — just no longer dependent on your availability."

### "What if it blocks something valid?"

**Response:** "Emergency override with one click. Plus the system learns: you approve an exception, it captures the rationale, similar cases get handled automatically next time."

---

## Case Study: E-Commerce Platform

**Staff Engineer:** 10 years at company, 300 engineers  
**Challenge:** Monolith decomposition, team scaling, knowledge preservation

**Before Substrate:**
- 50% of time reviewing PRs
- Architecture documented in 50 Confluence pages (stale)
- New team members repeating old mistakes

**With Substrate:**
- Automated policy evaluation: 15 policies
- Live architecture graph: always current
- WHY layer: 120 ADRs linked to services

**Results:**
- Personal review time: 50% → 10%
- Monolith decomposition: 3x faster
- New engineer onboarding: 6 weeks → 2 weeks
- Staff engineer promoted to Principal

**Quote:**
> "Substrate didn't replace me — it amplified me. I went from bottleneck to enabler."
