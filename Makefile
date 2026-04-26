# substrate monorepo
SHELL := /bin/bash
.DEFAULT_GOAL := help

# MODE selects which env file drives the stack. `local` is dev on
# localhost; `prod` is the public deployment reached through home-stack's
# nginx-proxy-manager. Override per-invocation, e.g. `make up MODE=prod`.
MODE     ?= local
ENV_FILE := .env.$(MODE)
COMPOSE  := ENV_FILE=$(ENV_FILE) docker compose --env-file $(ENV_FILE)

.PHONY: help up down restart nuke nuke-keycloak ps logs doctor test test-e2e lint

help: ## Show this help
	@awk 'BEGIN{FS=":.*##"; printf "\nUsage: make <target> [MODE=local|prod]\n\nTargets:\n"} /^[a-zA-Z_-]+:.*##/ {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

up: $(ENV_FILE) ## Render realm from $(ENV_FILE) and build + start the stack
	@ENV_FILE=$(ENV_FILE) bash scripts/configure.sh
	$(COMPOSE) up -d --build

$(ENV_FILE):
	@cp $(ENV_FILE).example $(ENV_FILE) && \
	  echo "created $(ENV_FILE) from $(ENV_FILE).example — review it, then re-run 'make up MODE=$(MODE)'" && \
	  exit 1

down: ## Stop and remove containers (volumes persist)
	$(COMPOSE) down

restart: down up ## Full stack restart

nuke: ## Stop and destroy all volumes (irreversible; confirms first)
	@read -p "Really destroy all volumes? (y/N) " ans && [ "$$ans" = "y" ]
	$(COMPOSE) down -v

nuke-keycloak: ## Drop keycloak DB and kc_data so --import-realm re-runs
	$(COMPOSE) stop keycloak
	$(COMPOSE) rm -f keycloak
	docker volume rm substrate_kc_data 2>/dev/null || true
	$(COMPOSE) exec -T postgres psql -U $${POSTGRES_SUPERUSER:-postgres} -c "DROP DATABASE IF EXISTS keycloak WITH (FORCE);"
	$(COMPOSE) up -d keycloak

ps: ## Container status
	$(COMPOSE) ps

logs: ## Tail logs for all services
	$(COMPOSE) logs -f --tail=200

doctor: ## Probe the stack and print PASS/FAIL per probe
	ENV_FILE=$(ENV_FILE) bash scripts/doctor.sh $(DOCTOR_ARGS)

test: ## Unit + integration tests across all services
	bash scripts/run-tests.sh

test-e2e: ## Playwright smoke against the live stack
	cd apps/frontend && pnpm exec playwright test

lint: ## ruff + mypy + vulture + tsc + eslint + knip + banned-token gate
	bash scripts/run-lint.sh
