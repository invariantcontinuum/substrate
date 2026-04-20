# Structural Drift

**The widening, invisible gap between architectural intent and production reality.**

---

## What is Structural Drift?

Structural drift occurs when the actual implementation of a software system diverges from its intended architecture over time. Unlike code bugs that cause immediate failures, drift is invisible until it causes a crisis.

### The Drift Equation

```
Drift = |Intended Architecture - Observed Reality|
```

**Intended Graph (G_I):**
- Architecture Decision Records (ADRs)
- Design documents
- Policy definitions
- Approved golden paths
- Terraform/K8s declarations

**Observed Graph (G_R):**
- Actual code dependencies
- Running services in production
- Live API calls
- SSH-verified host state

---

## Types of Drift

### Divergences (Shadow IT)
Elements in production that shouldn't exist:

- **Undeclared services**: Microservices deployed without approval
- **Shadow APIs**: Endpoints not in the gateway
- **Direct database access**: Bypassing the data layer
- **Unapproved dependencies**: Libraries not in allow-list

**Example:**
```
[Service A] → [Service B]  (intended)
[Service A] → [Database]   (divergence — direct access detected)
```

### Absences (Ghost Architecture)
Elements that should exist but don't:

- **Missing services**: Planned components never implemented
- **Deprecated services still referenced**: Old dependencies not cleaned up
- **Unenforced policies**: Rules defined but not applied

**Example:**
```
[Service A] → [Auth Gateway] → [Service B]  (intended)
[Service A] → [Service B]                  (absence — missing gateway)
```

### Staleness (Living Dead)
Elements that exist but are outdated:

- **Stale dependencies**: Old library versions
- **Orphaned documentation**: Docs for deleted services
- **Broken references**: Links to non-existent ADRs

---

## The Cost of Drift

### Quantified Impact

| Cost Category | Calculation | Annual Impact |
|---------------|-------------|---------------|
| Incident remediation | 2 major incidents × $100K | $200K |
| Velocity reduction | 40% of eng time × $2M payroll | $800K |
| Audit failure | Remediation + lost deals | $500K |
| Knowledge rediscovery | 3 departures × 3 months × $15K/month | $135K |
| **Total** | | **$1.6M+** |

### Case Study: Cloudflare 2025

**What happened:** Configuration drift caused 5% of all requests to fail.

**Root cause:** Staged configuration change inadvertently applied to production.

**Impact:**
- Global outage lasting hours
- Reputational damage
- Regulatory scrutiny
- Emergency engineering effort

**Substrate would have:**
1. Detected configuration drift within 15 minutes
2. Flagged the mismatch between declared and observed state
3. Alerted with specific violation details
4. Suggested remediation steps

---

## How Substrate Solves Drift

### 1. Continuous Observation

The SSH Runtime Connector verifies actual state:

```bash
# Every 15 minutes
systemctl list-units --type=service --state=running
ss -tlnp --json
docker inspect $(docker ps -q)
```

Compared against declared topology in the graph.

### 2. Drift Score Computation

```python
def compute_drift(intended, observed):
    convergences = intended & observed
    divergences = observed - intended
    absences = intended - observed
    
    score = (len(divergences) + len(absences)) / total
    return DriftScore(score, convergences, divergences, absences)
```

### 3. Alerting and Visualization

| Drift Level | Score | Action |
|-------------|-------|--------|
| Healthy | 0.0 - 0.3 | Monitor |
| Warning | 0.3 - 0.6 | Alert |
| Critical | 0.6 - 1.0 | Page |

Dashboard shows:
- Drift score over time
- Specific divergences and absences
- Trending direction
- Affected domains

### 4. Automated Remediation

For deterministic fixes:
1. Generate Fix PR with Qwen2.5-Coder
2. Run simulation to verify fix
3. Open PR with explanation
4. Link to original violation

---

## Drift Detection in Action

### Scenario: The Missing Gateway

**Intended:**
```yaml
# Architecture policy
api-gateway-first:
  rule: "All inter-service calls MUST route via api-gateway"
  enforcement: hard-mandatory
```

**Observed:**
```cypher
// Graph query finds direct calls
MATCH (s:Service)-[:CALLS]->(t:Service)
WHERE NOT (s)-[:CALLS]->(:Service {name: 'api-gateway'})-[:CALLS]->(t)
RETURN s.name, t.name
```

**Result:**
```
Violation: Direct call from payment-service to auth-service
Policy: api-gateway-first (POLICY-012)
WHY: ADR-047 (post-incident mandate)
Suggested Fix: Route via api-gateway-prod
```

### Scenario: The Shadow Database

**SSH Runtime Connector detects:**
```json
{
  "host": "db-server-03",
  "running_processes": [
    {"name": "postgres", "port": 5433}
  ]
}
```

**Graph declares:**
```cypher
MATCH (i:InfraResource {name: 'db-server-03'})-[:HOSTS]->(db)
RETURN db.port  // Expected: 5432
```

**Result:**
```
Runtime Violation: Undeclared database on db-server-03:5433
Declared: payment-db on 5432
Undeclared: unknown postgres instance on 5433
Action: Investigate or add to graph
```

---

## Drift Prevention

### Simulation Before Deployment

Before applying Terraform changes:

```
Simulation: terraform plan for vpc-update

Affected services: 12
Policy violations introduced: 0
Policy violations resolved: 1
Drift delta: -0.05 (improvement)
Blast radius: 3 hops

Recommendation: PROCEED
Confidence: 94%
```

### Policy as Code

Rego policy preventing common drift patterns:

```rego
package substrate.drift

# No direct service-to-service calls
deny[msg] {
    call.direct
    not call.via_gateway
    msg := sprintf("Direct call from %s to %s violates api-gateway-first", [call.source, call.target])
}

# All services must have declared owner
deny[msg] {
    service := input.services[_]
    not service.owner
    msg := sprintf("Service %s has no owner", [service.name])
}
```

---

## Measuring Success

### Key Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Drift score | <0.3 (healthy) | Daily computation |
| Time to detect | <15 minutes | SSH inspection cycle |
| Time to remediate | <24 hours | Violation resolution |
| Drift incidents | Zero critical | Incident tracking |

### ROI Calculation

**Before Substrate:**
- Major drift incidents: 2/year × $100K = $200K
- Detection time: Days to weeks
- Remediation: Manual, error-prone

**With Substrate:**
- Subscription: $6K/year
- Detection time: Minutes
- Remediation: Automated where possible

**Net savings: $194K/year (32x ROI)**
