# Investor Questions Answered

## The 20 Critical Questions

### 1. What problem are you solving?

As AI accelerates software development velocity by 3-5x, the gap between "what we designed" and "what actually runs" is widening at machine speed. AI code assistants generate syntactically correct but architecturally incoherent code — creating "AI slop" that bypasses design patterns and introduces shadow dependencies.

This is structural entropy, not just technical debt. It makes systems unmaintainable, unauditable, and unreliable. Current tools can only detect symptoms after damage occurs.

### 2. Who is your customer?

**Primary (Year 1-2):** VP Engineering / Head of Platform Engineering
- Company size: 50-500 engineers
- Tech stack: Modern (TypeScript, Python, microservices, K8s)
- Pain: "Our codebase quality collapsed after adopting GitHub Copilot"
- Budget: $50K-200K annual software spend
- Timeline: 3-6 months

**Secondary (Year 3+):** CIO / VP Operations
- Company size: F500, regulated industries
- Pain: "We have no way to ensure AI agents follow compliance rules"
- Budget: $500K-2M annual spend
- Timeline: 12-18 months

### 3. What is your solution?

**The Substrate Platform**: A knowledge graph infrastructure that ingests multi-modal data (code, docs, tickets, runtime state) and enables:

1. **Observation** — Continuous monitoring of reality vs intent gaps
2. **Reasoning** — GraphRAG-powered analysis of structural violations
3. **Governance** — Policy-as-code enforcement before production
4. **Action** — Automated remediation and human-in-loop escalation

### 4. How big is the market?

**TAM (Total Addressable Market):** ~$15-20B by 2030

- Internal Developer Platforms: $2.1B
- SAST/DAST/ASPM: $8.4B
- Enterprise Architecture: $1.8B
- Supply Chain Software (5%): $1.85B
- Clinical Trial Tech (compliance subset): $400M
- Robotics Software (safety/governance 10%): $970M

**SAM (Serviceable Addressable Market):** ~$5B by 2030
- Companies with >50 engineers using AI code tools
- F500 with complex supply chains deploying AI
- Pharma running decentralized clinical trials

**SOM (Serviceable Obtainable Market):** ~$150-300M by Year 5
- Realistic market share: 2-5% of SAM
- Based on early mover advantage in platform engineering

### 5. What's your business model?

**Hybrid: Usage-based + Enterprise licensing**

**CodeGraft/Chronicle (SMB/Mid-market):**
- Free: Public repos, community features
- Pro: $39/repo/month or $499/month unlimited
- Team: $79/user/month

**Sentinel/TrialGuard/Nexus (Enterprise):**
- Platform fee: $100K-500K annual base
- Usage tier: Per-transaction or per-asset
- Professional services: 20-30% of license

**Gross margin targets:**
- Year 1-2: 40%
- Year 3-5: 60-70%

### 6. Who are your competitors?

We don't have direct competitors — we have partial overlaps:

| Category | Players | What They Do | What We Do Differently |
|----------|---------|--------------|------------------------|
| IDPs | Backstage, Port | Catalog services (passive) | Enforce architecture (active) |
| SAST | SonarQube, Snyk | Find bugs, vulnerabilities | Detect structural violations |
| CSPM | Wiz, Orca | Secure cloud infra | Govern architecture correctness |
| EA Tools | LeanIX, Ardoq | Strategic planning | Continuous reality validation |
| AI Code | Copilot, Cursor | Generate code | Govern generated code |

**Why we win:**
1. Cross-domain knowledge graph
2. GraphRAG precision
3. Active governance (we block, not just report)
4. AI-native architecture

### 7. What's your unfair advantage?

**Technical Architecture Moat:**
- Multi-model database approach
- Stack-Graphs for compiler-level precision
- 6-12 month head start on GraphRAG

**Timing Advantage:**
- AI slop crisis is *now* (2025-2026)
- Platform engineering budgets exist *now*
- Regulatory pressure rising

**Platform Leverage:**
- Build once, deploy 6x (all products)
- Each product makes others more valuable
- Switching costs accumulate

### 8. What are your traction metrics?

**Current State:** (Pre-seed / Seed)
- Product: MVP in development
- Customers: 0 paying, 3-5 design partners committed
- Revenue: $0 ARR
- Team: Founders + 2-4 early engineers

**Year 1 Targets:**
- Customers: 10 paying, 50 free tier
- ARR: $100-150K
- Churn: <10% monthly
- NPS: >40

**Year 2 Targets:**
- Customers: 50-75 paying
- ARR: $500K-1M
- Net Dollar Retention: >110%
- CAC Payback: <12 months

### 9. What's your team?

**Ideal Founding Team:**

- **CEO**: Product management, enterprise sales, or technical founder with business acumen
- **CTO**: Distributed systems, databases, or compiler engineering
- **Chief Scientist (by Series A)**: PhD in ML/NLP, GraphRAG research

**Early Hires (Year 1):**
- Backend Engineer (Rust, graph databases)
- Frontend Engineer (React, WebGL)
- AI/ML Engineer (LLM integration)
- DevRel / Sales Engineer

### 10. How much are you raising?

**Seed Round (Year 1): $2-3M**
- Runway: 18-24 months
- Milestones: Ship MVP, 10 customers, $100K ARR
- Use of funds: Engineering 60%, Infrastructure 15%, GTM 15%, Operations 10%

**Series A (Year 2): $5-8M**
- Milestones: Launch Chronicle, $1M ARR, 50+ customers
- Use of funds: Engineering 50%, Sales & Marketing 35%, Operations 15%

### 11. What's your go-to-market strategy?

**Phase 1: Developer-Led (Year 1-2)**
- Bottom-up adoption through free tier
- Content marketing and community building
- Product-led growth with self-service

**Phase 2: Sales-Assisted (Year 2-3)**
- Hire first Account Executives
- Outbound to platform engineering teams
- Land-and-expand within accounts

**Phase 3: Enterprise (Year 3+)**
- Direct sales to F500
- Industry-specific GTM
- RFP responses for large deals

### 12. What's your product roadmap?

**Year 1: Platform + CodeGraft**
- Q1-Q2: Foundation
- Q3-Q4: CodeGraft MVP

**Year 2: Multi-product validation**
- Q1-Q2: Chronicle launch
- Q3-Q4: CodeGraft expansion

**Year 3: Enterprise expansion**
- Q1-Q2: Sentinel development
- Q3-Q4: First enterprise pilots

**Year 4-5: Complete portfolio**
- TrialGuard, Nexus EA, Nexus Agent

### 13. What could kill this company?

**Execution Risks:**
- Platform complexity spiral
- AI accuracy failure (<80% GraphRAG accuracy)
- Cold start problem (empty graph = no value)

**Market Risks:**
- Category education exhaustion
- GitHub/Microsoft adds architectural linting
- Economic downturn cuts developer tool budgets

**Mitigations:**
- Focus on one product first (CodeGraft)
- Human-in-loop validation
- Lead with pain, not category

### 14. What's your exit strategy?

**Likely Acquirers (5-7 year horizon):**

1. **Microsoft/GitHub** — Add governance to Copilot ($100M-200M+ comparable)
2. **GitLab/Atlassian** — Complete DevOps platform ($295M comparable)
3. **Datadog** — Expand to structural observability ($200M+ comparable)
4. **HashiCorp/Pulumi** — Add governance to IaC
5. **SAP/Oracle** — Modernize EA offerings

**Most Realistic Outcome:** Strategic acquisition at $300M-1B
- Assumes: $30-50M ARR, strong growth, category leadership
- Multiple: 10-20x ARR

### 15. Why now? Why you?

**Why Now (2025-2026):**
- AI code generation crossed adoption threshold (70% of developers)
- Platform engineering budget shift (80% of enterprises by 2026)
- Regulatory pressure accelerating (EU AI Act, DORA)
- GraphRAG algorithms published, multi-model databases production-ready

**Why You:**
- Technical depth: Distributed systems + graph databases + LLMs
- Domain expertise: Understanding of target verticals
- Product intuition: Ability to simplify complexity
- Execution bias: Willing to start with MVP

### 16. What are your key assumptions?

**Technical:**
- GraphRAG achieves >85% accuracy
- Database scales to 100M nodes
- LLM costs drop 10x by Year 3

**Market:**
- Developers perceive AI slop as real problem
- Platform engineering budgets are growing
- Customers willing to trust AI governance

**Business:**
- CAC payback <12 months
- Net Dollar Retention >110%
- Platform creates defensibility

### 17. What's your pricing philosophy?

1. **Align with value delivered**: Per-repo for CodeGraft, per-user for Chronicle
2. **Start low, expand**: Free → Pro ($39) → Team ($79) → Enterprise (custom)
3. **Transparent, predictable**: No hidden fees, clear usage limits
4. **Expansion built-in**: Easy to start small, natural growth triggers

### 18. What open-source strategy?

**Hybrid: Open Core Model**

**Open Source (MIT License):**
- Core graph platform
- Connector framework SDK
- Policy template library

**Closed Source (Commercial):**
- CodeGraft Studio (UI/UX)
- GraphRAG advanced features
- Enterprise connectors
- Self-hosted deployment

### 19. What partnerships?

**Year 1-2: Integration Partners**
- GitHub/GitLab: Marketplace integrations
- Datadog/New Relic: Link observability to architecture
- Atlassian: Close requirements-to-code gap

**Year 3-4: Channel Partners**
- System Integrators (Accenture, Deloitte)
- Cloud Providers (AWS, Azure, GCP)

### 20. How do you define success?

**Year 1 (Validation):**
- 10 paying customers
- $100K ARR
- >85% GraphRAG accuracy
- <10% monthly churn

**Year 3 (Growth):**
- $3-5M ARR
- 100+ customers
- >120% NDR
- 5+ enterprise customers

**Year 5 (Market Leadership):**
- $20-30M ARR
- 40%+ market share in AI code governance
- Category leader ("the Datadog of structural integrity")
