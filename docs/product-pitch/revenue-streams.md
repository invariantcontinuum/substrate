# Revenue Streams

Substrate employs a **hybrid business model** combining usage-based SaaS with enterprise licensing to capture value across market segments.

---

## Pricing Tiers

### Starter (Free)

| Feature | Limit |
|---------|-------|
| Users | 3 |
| Repositories | 1 |
| Hosts | 0 |
| History retention | 7 days |
| Features | Read-only graph view |

**Purpose:** Developer adoption, community building, demand generation

---

### Team ($499/month)

**Target:** Engineering teams of 5-15 members

| Feature | Limit |
|---------|-------|
| Users | 15 |
| Repositories | 20 |
| SSH-monitored hosts | 10 |
| History retention | 12 months |
| Teams | 1 |

**Included Features:**
- ✅ All 6 core services
- ✅ Institutional memory (WHY layer)
- ✅ Simulation engine
- ✅ SSH Runtime Connector
- ✅ CI/CD blocking
- ✅ Keycloak bundled
- ✅ Email support (48h SLA)

**Annual Cost:** $5,988

---

### Scale ($1,499/month + $0.50/node)

**Target:** Growing engineering organizations

| Feature | Limit |
|---------|-------|
| Users | 75 |
| Nodes | Unlimited (pay per node) |
| Teams | Up to 5 |
| History retention | 24 months |

**Additional Features:**
- ✅ Multi-team isolation
- ✅ Audit/evidence export
- ✅ Org-private marketplace
- ✅ Priority email support (24h SLA)

**Example:** 500 nodes × $0.50 = $250/month + $1,499 base = $1,749/month

---

### Enterprise (Custom: ~$30K-120K/year)

**Target:** Fortune 500, regulated industries

| Feature | Limit |
|---------|-------|
| Users | Unlimited |
| Nodes | Unlimited |
| Teams | Unlimited |
| History retention | Infinite |

**Enterprise Features:**
- ✅ Any OIDC/SAML IdP
- ✅ Custom LoRA adapters
- ✅ Air-gap deployment
- ✅ 99.9% financial SLA
- ✅ Dedicated CSM + Phone support (4h SLA)
- ✅ Professional onboarding included

---

## Add-On Pricing

| Add-On | Price | Description |
|--------|-------|-------------|
| Extended history | +$99/month per year | Retain data beyond plan default |
| Custom LoRA training | $5,000 one-time + $199/month | Domain-specific AI adapters |
| Additional connector | $2,500 one-time | Custom ingestion connector |
| Professional onboarding | $2,500 one-time | 2-day guided setup |
| Architecture review | $1,500/session | 2-hour working session |
| SSH host expansion | $200/month per 50 hosts | Beyond plan limits |

---

## Revenue Model by Product

### CodeGraft (AI Code Governance)

**Primary Revenue Driver (Year 1-3)**

| Tier | ARPU | Target | Revenue |
|------|------|--------|---------|
| Free | $0 | 1,000 users | $0 |
| Pro | $499/mo | 100 teams | $598K/year |
| Team | $1,185/mo* | 50 teams | $711K/year |
| Enterprise | $75K/yr | 10 customers | $750K/year |

*Team average with node fees

**Year 3 Target:** $2M ARR

---

### Chronicle (Institutional Memory)

**Secondary Product (Year 2)**

| Tier | ARPU | Target | Revenue |
|------|------|--------|---------|
| Team | $299/mo | 30 teams | $107K/year |
| Enterprise | $50K/yr | 5 customers | $250K/year |

**Bundled with CodeGraft** for Teams and above

---

### Enterprise Products (Year 3+)

**High-Value Verticals**

| Product | Target ACV | Customers | Revenue |
|---------|------------|-----------|---------|
| Sentinel (Supply Chain) | $150K | 5 | $750K |
| TrialGuard (Clinical) | $200K | 3 | $600K |
| Nexus EA | $100K | 5 | $500K |

**Year 5 Target:** $15M ARR combined

---

## Revenue Recognition

### SaaS Subscriptions
- Monthly/annual recurring revenue
- Recognized ratably over subscription term
- Annual prepay common for 15-20% discount

### Usage-Based Components
- Node counts: Billed monthly in arrears
- Per-transaction: Billed monthly

### Professional Services
- Implementation: 20-30% of first-year license
- Training: Fixed fee per session
- Support: Included in Enterprise, add-on for lower tiers

---

## Unit Economics Targets

### Customer Acquisition Cost (CAC)

| Channel | CAC | Notes |
|---------|-----|-------|
| Organic/PLG | $500 | Free tier conversion |
| Content Marketing | $2,000 | Blog, SEO, community |
| Outbound Sales | $10,000 | SDR + AE compensation |
| Events | $15,000 | Conferences, trade shows |

### Lifetime Value (LTV)

| Segment | ACV | Retention | LTV |
|---------|-----|-----------|-----|
| Team | $6K | 85% (3yr) | $15K |
| Scale | $21K | 90% (4yr) | $65K |
| Enterprise | $100K | 95% (5yr) | $400K |

### LTV:CAC Ratio

**Target:** >3:1
- Team: 15K:2K = 7.5:1
- Scale: 65K:10K = 6.5:1
- Enterprise: 400K:50K = 8:1

### Payback Period

**Target:** <12 months
- PLG conversions: 1-2 months
- Sales-assisted: 6-9 months
- Enterprise: 9-12 months

---

## Expansion Revenue

### Land-and-Expand Strategy

1. **Land** (Month 0)
   - Free tier or Team plan
   - 1-2 repositories

2. **Expand** (Month 3-6)
   - Add repositories (+$20/repo for Pro)
   - Add users (+$39/user for Pro)
   - Add SSH hosts (+$200/50 hosts)

3. **Upgrade** (Month 6-12)
   - Pro → Team or Scale
   - Add Chronicle (bundled in higher tiers)

4. **Cross-Sell** (Year 2+)
   - Sentinel (supply chain)
   - TrialGuard (clinical)
   - Nexus EA

### Expansion Metrics

**Net Dollar Retention (NDR):**
- Year 1 Target: 110%
- Year 3 Target: 120%
- Year 5 Target: 130%

**Logo Retention:**
- Year 1: 85%
- Year 3: 90%
- Year 5: 95%

---

## Gross Margins

### Year 1-2: 40%

**Costs:**
- Cloud infrastructure: 30%
- LLM inference (external): 20%
- Support: 10%

### Year 3-5: 60-70%

**Improvements:**
- Local LLM inference (DGX Spark)
- Infrastructure optimization
- Scale economies

### Path to 70%+

- Multi-tenant efficiency
- Model distillation
- Customer self-hosting (Enterprise)
- CDN for documentation/delivery

---

## Market Comparison

| Tool | Pricing Model | Min Annual Cost |
|------|---------------|-----------------|
| Backstage (self-host) | Engineering time | ~$80K impl + maintenance |
| LeanIX/Ardoq | Per application | $30K+ |
| Wiz | Custom enterprise | $50K+ |
| Datadog | Per host + ingestion | $18K+ |
| SonarQube Enterprise | Flat license | $30K+ |
| **Substrate Team** | **Flat monthly** | **$5,988** |

**Value Proposition:** All of the above for a single team at 10-20% of the cost.
