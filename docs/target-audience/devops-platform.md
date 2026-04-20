# DevOps / Platform Engineer

**The infrastructure owner and reliability guardian.**

---

## Profile

### Firmographics

| Attribute | Profile |
|-----------|---------|
| **Company Size** | Mid-market to enterprise |
| **Team Size** | 5-20 platform engineers |
| **Responsibility** | Infrastructure, deployment, observability, reliability |
| **Tools** | Terraform, Kubernetes, AWS/Azure/GCP, Datadog |
| **Pain** | "I find out about drift from incidents, not before" |

### Role Definition

| Aspect | Detail |
|--------|--------|
| **Primary** | Maintain infrastructure, enable developer velocity |
| **Secondary** | Cost optimization, security compliance, incident response |
| **Reports To** | VP Engineering, Director of Infrastructure |
| **Collaborates With** | Development teams, Security, SRE |

---

## Pain Points

### Priority 1: "I find out about infrastructure drift from incidents"

**The Problem:**
- Terraform state says one thing
- Reality is different
- Discovery happens during incident response

**Example:**
```
Incident Timeline:
- 14:00: Service degradation reported
- 14:15: Root cause identified: wrong instance type
- 14:30: Terraform plan shows: should be m5.large
- 14:35: AWS console shows: actually m5.xlarge (changed manually 3 weeks ago)
- 15:00: Fixed, post-mortem begins

Question: Why didn't we know about the manual change?
```

**Substrate Solution:**
- SSH Runtime Connector compares declared vs observed
- Detects drift within 15 minutes
- Alerts before incident

### Priority 2: "Terraform apply is scary on large changes"

**The Problem:**
- Large Terraform changes = unknown blast radius
- No way to preview impact on services
- Rollbacks are painful

**Current State:**
```bash
$ terraform plan
# ... 500 lines of changes ...
# Do you want to apply? (yes/no)
# 🤞 Hope this doesn't break anything
```

**Substrate Solution:**
- Simulation engine: preview impact before apply
- Blast radius calculation: which services affected
- Policy evaluation: will this violate constraints?

### Priority 3: "No visibility into what's actually running"

**The Problem:**
- Kubernetes has 500 pods
- Some are from old deployments
- Some are manually created
- No unified view of runtime topology

**Substrate Solution:**
- Live graph from K8s API watch
- SSH verification of host state
- Unified view: code + infrastructure + runtime

### Priority 4: "Configuration changes bypass review"

**The Problem:**
- Someone changes a ConfigMap directly
- Service behavior changes
- No audit trail
- Root cause analysis takes hours

**Substrate Solution:**
- Runtime verification detects changes
- Graph diff shows what changed
- Linked to policy violations if any

---

## Use Cases

### 1. Pre-Deployment Simulation

**Before Terraform apply:**
```
> Simulate: terraform plan for vpc-changes

Affected infrastructure:
- VPC: production-vpc
- Subnets: 6
- Route tables: 4
- Security groups: 12

Service impact:
- Services affected: 8
- API dependencies: 15
- Database connections: 6

Policy evaluation:
- Violations introduced: 0
- Violations resolved: 1 (unauthorized route)

Drift delta: -0.08 (improvement)

Recommendation: PROCEED
Confidence: 92%
```

### 2. Runtime Drift Detection

**SSH Runtime Connector finds:**
```
ALERT: Runtime Drift Detected

Host: prod-worker-05
Declared: payment-service v2.3.1, port 8080
Observed: payment-service v2.3.0, port 8080

Drift: Version mismatch (patch version)
Severity: Medium
Last deploy: 14 days ago

Possible causes:
- Manual rollback
- Failed deployment
- Configuration drift

Action: Investigate or approve exception
```

### 3. Blast Radius Analysis

**Before maintenance:**
```
> Blast radius: database-primary

Direct dependencies: 6 services
Indirect dependencies (2 hops): 14 services
Total affected: 20 services

Critical path:
- payment-service (P0)
- order-service (P0)
- inventory-service (P1)

Recommended maintenance window:
- Lowest traffic: Sunday 02:00-04:00 UTC
- Estimated impact: 500 users
```

### 4. Configuration Validation

**Detecting invalid configs:**
```
VIOLATION: Configuration Drift

Resource: ConfigMap/app-config
Declared: max_connections: 100
Observed: max_connections: 1000

Policy: resource-limits (POLICY-023)
Rule: max_connections must match declared value

Risk: Resource exhaustion, cascading failure

Fix: Revert to 100 or update Terraform
```

---

## Integration Points

### Terraform

```hcl
# Terraform module with Substrate metadata
module "payment_service" {
  source = "./modules/service"
  
  name = "payment-service"
  domain = "payments"
  
  # Substrate annotations
  substrate_metadata = {
    owner = "payments-team"
    dependencies = ["database-primary", "redis-cache"]
    policies = ["pci-boundary", "api-gateway-first"]
  }
}
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  annotations:
    substrate.io/domain: payments
    substrate.io/owner: payments-team
    substrate.io/policies: pci-boundary,api-gateway-first
spec:
  # ... standard deployment spec
```

### CI/CD

```yaml
# GitHub Actions workflow
- name: Substrate Pre-Deploy Check
  uses: substrate/github-action@v1
  with:
    terraform-plan: plan.json
    fail-on-violation: true
```

---

## Value Proposition

### Before Substrate

| Activity | Frequency | Time | Annual Cost |
|----------|-----------|------|-------------|
| Manual drift detection | Weekly | 4 hrs | $40K |
| Incident response (drift-related) | Monthly | 8 hrs | $24K |
| Pre-deploy analysis | Per deploy | 2 hrs | $30K |
| Root cause analysis | Monthly | 4 hrs | $12K |
| **Total** | | | **$106K** |

### With Substrate

- Subscription: $6K/year
- Implementation: $2.5K
- **Total: $8.5K**

**Net savings: $97.5K/year (12x ROI)**

### Operational Improvements

| Metric | Before | After |
|--------|--------|-------|
| Drift detection time | Days/weeks | 15 minutes |
| Pre-deploy confidence | Gut feeling | Data-driven (92%+) |
| Incident root cause | Hours | Minutes |
| Blast radius knowledge | Tribal | Queryable |

---

## Messaging

### Elevator Pitch

> "You maintain infrastructure but find out about drift from incidents. Substrate continuously verifies what you declared against what's actually running, simulates changes before you apply them, and shows you the blast radius of any component — so you prevent incidents instead of responding to them."

### Key Messages

1. **Know what's running**
   - "SSH verification every 15 minutes"
   - "Detect manual changes immediately"

2. **Deploy with confidence**
   - "Simulate Terraform changes before apply"
   - "Know the blast radius in advance"

3. **Prevent incidents**
   - "Catch drift before it causes outage"
   - "Validate configs continuously"

4. **Debug faster**
   - "Query architecture in natural language"
   - "Trace dependencies in seconds"

---

## Case Study: SaaS Platform

**Company:** B2B SaaS, 200 engineers  
**Challenge:** Multi-tenant infrastructure, frequent deploys, reliability requirements

**Before:**
- 3 incidents/quarter from configuration drift
- Terraform changes: 2-day review process
- No visibility into cross-service impact

**With Substrate:**
- SSH Runtime Connector on all hosts
- Pre-deploy simulation mandatory
- Blast radius queries for all changes

**Results:**
- Drift-related incidents: 3/quarter → 0
- Deploy frequency: 5/day → 20/day (confidence)
- Mean time to resolution: 45 min → 12 min
- Terraform review time: 2 days → 4 hours

**Quote:**
> "Substrate turned infrastructure management from reactive firefighting to proactive governance."
