# Scrum Master / Engineering Manager

**The team facilitator and process optimizer.**

---

## Profile

### Firmographics

| Attribute | Profile |
|-----------|---------|
| **Company Size** | 50-200 engineers |
| **Team Structure** | Feature teams (6-8 people), rotating on-call |
| **Development Model** | Agile/Scrum, 2-week sprints |
| **Geography** | Often distributed, multiple timezones |
| **Focus** | Team productivity, process improvement, delivery |

### Role Definition

| Aspect | Detail |
|--------|--------|
| **Primary** | Enable team productivity, remove blockers |
| **Secondary** | Sprint planning, retrospectives, reporting |
| **Reports To** | VP Engineering, Director of Engineering |
| **Collaborates With** | Product, Engineering, DevOps |

---

## Pain Points

### Priority 1: "Sprint retrospectives lack structural insight"

**The Problem:**
- Retros focus on process, feelings, anecdotes
- No data on structural debt accumulated
- Same technical debt conversation every sprint with no progress

**Current Retrospective:**
```
What went well?
- "We shipped the feature"
- "Good collaboration"

What could improve?
- "Technical debt" (same as last 6 retros)
- "On-call was hard" (vague)
- "Need more documentation" (never prioritized)

No data, no accountability, no improvement.
```

**Substrate Solution:**
```
Sprint Structural Report (Auto-generated):
- New violations introduced: 3
- Drift score change: +0.05 → +0.12
- Services with new dependencies: 2
- ADR gaps created: 1
- Key-person risk: Alice owns 3 services, no backup

Recommendations:
- Schedule refactoring for OrderService (coupling >10)
- Document rationale for new database choice
- Assign secondary owner for PaymentService
```

### Priority 2: "I can't tell who knows what"

**The Problem:**
- Need someone who understands the billing system
- Ask in Slack: "Who worked on this?"
- Response: "Person X, but they left"
- Or: Silence

**Substrate Solution:**
```
Query: "Who knows about billing?"

Results:
- Alice: OWNS billing-service, authored ADR-023
- Bob: CONTRIBUTED 12 PRs, commented on ADR-023
- Carol: LAST MODIFIED 3 months ago

Recommendation: Alice is leaving next sprint — initiate knowledge transfer
```

### Priority 3: "Velocity is declining and I don't know why"

**The Problem:**
- Story points per sprint trending down
- Stakeholders asking "why is the team slower?"
- No data to distinguish:
  - Is scope increasing?
  - Is technical debt slowing us?
  - Are estimates wrong?

**Substrate Solution:**
```
Velocity Analysis:

Story points: 45 → 32 (-29%)

Contributing factors:
- New dependencies on legacy-core domain: +4 services
- Legacy-core coupling: 4× higher cycle time
- 3 services have >10 transitive dependencies
- Recommendation: Prioritize legacy-core refactoring

Confidence: 78%
```

### Priority 4: "Async handoffs lose critical context"

**The Problem:**
- SF team hands off to Berlin team
- Berlin team asks "why did you do it this way?"
- Answer in a sync meeting SF wasn't in
- Decisions get re-litigated across timezones

**Substrate Solution:**
- WHY layer captures rationale
- Context available async
- No timezone-dependent knowledge transfer

---

## Use Cases

### 1. Sprint Planning

**Before planning:**
```
> Query: "Which services does this epic affect?"

Epic: "Add payment methods"

Affected services: 8
- payment-service (primary)
- order-service (dependency)
- notification-service (dependency)
- ...

Complexity factors:
- 2 services with high coupling
- 1 service with key-person risk
- 3 ADR gaps

Recommended story split:
- Core payment logic (3 points)
- Integration with order flow (5 points)
- Notification triggers (2 points)
```

### 2. Sprint Retrospective

**Auto-generated report:**
```
Sprint 23 Structural Health Report

Violations:
- Introduced: 3
- Resolved: 5
- Net: -2 (improving)

Drift:
- Sprint start: 0.18
- Sprint end: 0.15
- Trend: ↓ Improving

Coupling:
- New dependencies: 4
- Refactored services: 2
- Average coupling: 6.2 (stable)

Team knowledge:
- ADRs created: 2
- Documentation added: 3 pages
- Coverage: 72% → 75%

Recommendations for next sprint:
- Address OrderService coupling (now at 12)
- Document UserService cache rationale
- Assign backup owner for BillingService
```

### 3. Team Health Monitoring

**Dashboard:**
```
Team: Payments Squad

Sprint Velocity: 38 points (trend: stable)
Cycle Time: 4.2 days (trend: ↓ improving)

Structural Health:
- Drift score: 0.12 (🟢 healthy)
- Violations: 2 (🟢 low)
- Knowledge coverage: 78% (🟡 improving)

Risks:
- Alice leaving in 2 weeks (key-person)
- 1 service with no ADR
- Legacy dependency on CoreService

Actions:
- Schedule knowledge transfer (Alice)
- Assign ADR documentation task
- Plan CoreService decoupling (next quarter)
```

### 4. Stakeholder Reporting

**Monthly report:**
```
Engineering Health Dashboard (April 2026)

Delivery:
- Features shipped: 12
- Velocity: 42 points/sprint (stable)
- Cycle time: 3.8 days (↓ 12% from March)

Quality:
- Production incidents: 2 (↓ 50%)
- Architectural violations caught: 18
- Drift score: 0.15 (🟢 healthy range)

Team:
- Onboarding time: 3 weeks (↓ from 6)
- Knowledge coverage: 80% (↑ from 72%)
- Key-person risks: 2 (addressed)

Investment:
- Feature work: 65%
- Technical debt: 25%
- Learning/innovation: 10%

Trend: Improving across all dimensions
```

---

## Integration with Scrum

### Sprint Events

| Event | Substrate Input |
|-------|-----------------|
| **Planning** | Epic impact analysis, complexity factors |
| **Daily Standup** | Blocker identification, dependency status |
| **Review** | Structural changes demo, violation summary |
| **Retro** | Auto-generated structural health report |

### Metrics

| Scrum Metric | Substrate Enhancement |
|--------------|----------------------|
| Velocity | Correlate with structural debt |
| Cycle time | Identify coupling bottlenecks |
| Burndown | Track technical debt paydown |
| Happiness | Knowledge coverage proxy |

---

## Value Proposition

### Before Substrate

| Activity | Pain Point |
|----------|------------|
| Sprint planning | No data on technical complexity |
| Retrospectives | Same debt conversation, no progress |
| Stakeholder updates | Subjective "we're working on it" |
| Team health | Anecdotal, reactive |
| Knowledge gaps | Discovered during crisis |

### With Substrate

| Activity | Improvement |
|----------|-------------|
| Sprint planning | Data-driven story sizing |
| Retrospectives | Measurable technical debt progress |
| Stakeholder updates | Objective metrics, trends |
| Team health | Proactive risk identification |
| Knowledge gaps | Detected and addressed early |

### Team Impact

| Metric | Before | After |
|--------|--------|-------|
| Retro action completion | 30% | 75% |
| Stakeholder satisfaction | 6/10 | 8.5/10 |
| Team morale (self-reported) | 6/10 | 8/10 |
| Predictability (commit vs deliver) | 60% | 85% |

---

## Messaging

### Elevator Pitch

> "Your retrospectives focus on feelings, not facts. Substrate gives you structural health data for every sprint — how much debt you accumulated, what knowledge gaps emerged, which dependencies are slowing you down — so your retros drive measurable improvement, not repeated conversations."

### Key Messages

1. **Data-driven retrospectives**
   - "Show structural debt trends, not just feelings"
   - "Track improvement over time"

2. **Proactive risk management**
   - "Know about knowledge gaps before departure"
   - "Identify coupling bottlenecks early"

3. **Better stakeholder communication**
   - "Report objective engineering health metrics"
   - "Explain velocity changes with data"

4. **Enable continuous improvement**
   - "Connect process changes to outcomes"
   - "Measure the impact of technical investments"

---

## Case Study: Distributed Team

**Team:** 8 engineers across SF, Berlin, Tokyo  
**Challenge:** Async communication, knowledge silos, declining velocity

**Before:**
- Velocity declining 10% per quarter
- Handoffs losing context
- Retros: "Communication issues" (no specifics)

**With Substrate:**
- Structural reports for every retro
- WHY layer for async context
- Knowledge gap alerts

**Results:**
- Velocity stabilized, then improved 15%
- Handoff issues: 5/quarter → 1/quarter
- Retro action completion: 40% → 80%
- Team satisfaction: 5/10 → 8/10

**Quote:**
> "Substrate gave us the vocabulary and data to discuss technical debt productively. Our retros finally drive change."
