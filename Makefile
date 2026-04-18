# substrate monorepo — root orchestration
SHELL := /bin/bash
.ONESHELL:
.DEFAULT_GOAL := help

COMPOSE        ?= docker compose --project-directory ops/compose --env-file .env
LLM_DIR        ?= ops/llm/lazy-lamacpp
ENV_EXAMPLES   := env/platform.env.example env/infra.env.example env/llm.env.example

.PHONY: help bootstrap up down nuke nuke-keycloak restart ps logs \
        llm-start llm-stop llm-status \
        test test-e2e lint doctor check-contracts

help: ## Show this help
	@awk 'BEGIN{FS=":.*##"; printf "\nUsage: make <target>\n\nTargets:\n"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

bootstrap: ## Copy env examples if missing; pull images; run doctor
	@for f in $(ENV_EXAMPLES); do \
	  target=$$(basename $$f .example); \
	  if [ ! -f "env/$$target" ]; then cp "$$f" "env/$$target" && echo "created env/$$target"; fi; \
	done
	@if [ ! -f .env ]; then cat env/*.env > .env && echo "created .env"; fi
	$(COMPOSE) pull 2>/dev/null || true
	$(MAKE) doctor

up: ## Start the full stack
	$(COMPOSE) up -d --build

down: ## Stop and remove containers (volumes persist)
	$(COMPOSE) down

nuke: ## Stop + remove volumes (destroys Postgres data); confirms first
	@read -p "Really destroy all volumes? (y/N) " ans && [ "$$ans" = "y" ]
	$(COMPOSE) down -v

nuke-keycloak: ## Drop the keycloak DB + kc_data volume so --import-realm reruns (substrate_graph untouched)
	$(COMPOSE) stop keycloak
	$(COMPOSE) rm -f keycloak
	docker volume rm substrate_kc_data 2>/dev/null || true
	$(COMPOSE) exec -T postgres psql -U $${POSTGRES_SUPERUSER:-postgres} -c "DROP DATABASE IF EXISTS keycloak WITH (FORCE);"
	$(COMPOSE) up -d keycloak

restart: down up ## Full stack restart

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
