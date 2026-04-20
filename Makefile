# substrate monorepo — root orchestration
SHELL := /bin/bash
.ONESHELL:
.DEFAULT_GOAL := help

LLM_DIR        ?= ops/llm/lazy-lamacpp
COMPOSE_BASE   := ops/compose/compose.yaml
COMPOSE_DEV    := ops/compose/compose.dev.yaml
COMPOSE_PROD   := ops/compose/compose.prod.yaml

# Active deployment mode is written by scripts/set-env.sh into .deploy-mode.
DEPLOY_MODE := $(shell cat .deploy-mode 2>/dev/null)
COMPOSE_OVERRIDE := $(if $(filter prod,$(DEPLOY_MODE)),$(COMPOSE_PROD),$(COMPOSE_DEV))
COMPOSE := docker compose --project-directory ops/compose \
           --env-file .env -f $(COMPOSE_BASE) -f $(COMPOSE_OVERRIDE)

.PHONY: help configure deploy-dev deploy-prod dev prod \
        up down nuke nuke-keycloak restart ps logs \
        llm-start llm-stop llm-status \
        test test-e2e lint doctor check-contracts

help: ## Show this help
	@awk 'BEGIN{FS=":.*##"; printf "\nUsage: make <target>\n\nTargets:\n"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

configure: ## Regenerate .env + realm JSON (MODE=dev|prod [DOMAIN=foo.com] [ACME_EMAIL=you@foo.com])
	@test -n "$(MODE)" || (echo "usage: make configure MODE=dev|prod [DOMAIN=foo.com]" && exit 1)
	@if [ "$(MODE)" = "prod" ]; then test -n "$(DOMAIN)" || (echo "prod requires DOMAIN=foo.com" && exit 1); fi
	@args=""; \
	 if [ -n "$(DOMAIN)" ]; then args="$$args --domain=$(DOMAIN)"; fi; \
	 if [ -n "$(ACME_EMAIL)" ]; then args="$$args --acme-email=$(ACME_EMAIL)"; fi; \
	 bash scripts/set-env.sh $(MODE) $$args

deploy-dev: ## Configure for localhost + bring up full stack
	@$(MAKE) configure MODE=dev
	@$(MAKE) up

deploy-prod: ## Configure for DOMAIN + bring up full stack (Traefik + Let's Encrypt)
	@test -n "$(DOMAIN)" || (echo "usage: make deploy-prod DOMAIN=foo.com [ACME_EMAIL=you@foo.com]" && exit 1)
	@$(MAKE) configure MODE=prod DOMAIN=$(DOMAIN) $(if $(ACME_EMAIL),ACME_EMAIL=$(ACME_EMAIL))
	@$(MAKE) up

dev: deploy-dev ## Alias for deploy-dev
prod: deploy-prod ## Alias for deploy-prod

up: ## Bring up the stack using the last configured mode
	@test -f .deploy-mode || (echo "no deployment configured — run: make configure MODE=dev|prod" && exit 1)
	$(COMPOSE) up -d --build

down: ## Stop and remove containers (volumes persist)
	@test -f .deploy-mode && $(COMPOSE) down || docker compose --project-directory ops/compose -f $(COMPOSE_BASE) down

nuke: ## Stop + remove volumes (destroys Postgres data); confirms first
	@read -p "Really destroy all volumes? (y/N) " ans && [ "$$ans" = "y" ]
	$(COMPOSE) down -v

nuke-keycloak: ## Drop keycloak DB + kc_data so --import-realm re-runs
	$(COMPOSE) stop keycloak
	$(COMPOSE) rm -f keycloak
	docker volume rm substrate_kc_data 2>/dev/null || true
	$(COMPOSE) exec -T postgres psql -U $${POSTGRES_SUPERUSER:-postgres} -c "DROP DATABASE IF EXISTS keycloak WITH (FORCE);"
	$(COMPOSE) up -d keycloak

restart: down up ## Full stack restart (preserves mode)

ps: ## Show container status
	$(COMPOSE) ps

logs: ## Tail logs for all services
	$(COMPOSE) logs -f --tail=200

llm-start: ## Start an LLM model (MODEL=embeddings|dense)
	@test -n "$(MODEL)" || (echo "usage: make llm-start MODEL=<name>" && exit 1)
	$(MAKE) -C $(LLM_DIR) start MODEL=$(MODEL)

llm-stop: ## Stop an LLM model
	@test -n "$(MODEL)" || (echo "usage: make llm-stop MODEL=<name>" && exit 1)
	$(MAKE) -C $(LLM_DIR) stop MODEL=$(MODEL)

llm-status: ## Show all LLM models' status
	$(MAKE) -C $(LLM_DIR) status-all

test: ## Unit + integration tests across all services
	bash scripts/run-tests.sh

test-e2e: ## Playwright smoke against live compose
	cd apps/frontend && pnpm exec playwright test

lint: ## ruff + mypy + biome + tsc + dead-code sweep
	bash scripts/run-lint.sh

doctor: ## Probe the whole stack; prints PASS/FAIL per probe
	bash scripts/doctor.sh $(DOCTOR_ARGS)

check-contracts: ## Compare pydantic and zod JSON schemas
	bash scripts/check-contracts.sh
