# substrate monorepo
SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help up down restart nuke nuke-keycloak ps logs doctor test test-e2e lint check-contracts

help: ## Show this help
	@awk 'BEGIN{FS=":.*##"; printf "\nUsage: make <target>\n\nTargets:\n"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

up: ## Render config and bring up the full stack (dev or prod — controlled by .env)
	@bash scripts/configure.sh
	docker compose up -d --build

down: ## Stop and remove containers (volumes persist)
	docker compose down

restart: down up ## Full stack restart

nuke: ## Stop and destroy all volumes (irreversible; confirms first)
	@read -p "Really destroy all volumes? (y/N) " ans && [ "$$ans" = "y" ]
	docker compose down -v

nuke-keycloak: ## Drop keycloak DB and kc_data so --import-realm re-runs (graph DB untouched)
	docker compose stop keycloak
	docker compose rm -f keycloak
	docker volume rm substrate_kc_data 2>/dev/null || true
	docker compose exec -T postgres psql -U $${POSTGRES_SUPERUSER:-postgres} -c "DROP DATABASE IF EXISTS keycloak WITH (FORCE);"
	docker compose up -d keycloak

ps: ## Container status
	docker compose ps

logs: ## Tail logs for all services
	docker compose logs -f --tail=200

doctor: ## Probe the stack and print PASS/FAIL per probe
	bash scripts/doctor.sh $(DOCTOR_ARGS)

test: ## Unit + integration tests across all services
	bash scripts/run-tests.sh

test-e2e: ## Playwright smoke against the live stack
	cd apps/frontend && pnpm exec playwright test

lint: ## ruff + mypy + vulture + tsc + eslint + knip + banned-token gate
	bash scripts/run-lint.sh

check-contracts: ## Diff pydantic JSON schemas vs zod JSON schemas
	bash scripts/check-contracts.sh
