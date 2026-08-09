SHELL := /bin/sh

COMPOSE_FILE := docker/compose/docker-compose.yml
ENV_FILE := .env
COMPOSE := docker compose --file $(COMPOSE_FILE) --env-file $(ENV_FILE)

.DEFAULT_GOAL := help

.PHONY: help
help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "Usage: make <target>\n\n"} /^[a-zA-Z0-9_-]+:.*## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: configure
configure: ## Create .env from the safe example (does not overwrite)
	@./scripts/configure.sh

.PHONY: start
start: ## Start the production stack without rebuilding images
	$(COMPOSE) up --detach

.PHONY: start-build
start-build: ## Build images and start the production stack
	$(COMPOSE) up --detach --build

.PHONY: stop
stop: ## Stop containers while preserving data volumes
	$(COMPOSE) down

.PHONY: restart
restart: ## Restart all services without rebuilding
	$(COMPOSE) restart

.PHONY: rebuild
rebuild: start-build ## Rebuild and restart all changed services

.PHONY: rebuild-server
rebuild-server: ## Rebuild and restart the server after backend changes
	$(COMPOSE) up --detach --build --no-deps server

.PHONY: rebuild-client
rebuild-client: ## Rebuild and restart the web client
	$(COMPOSE) up --detach --build --no-deps client

.PHONY: logs
logs: ## Follow logs from every service
	$(COMPOSE) logs --follow

.PHONY: logs-server
logs-server: ## Follow backend logs
	$(COMPOSE) logs --follow server

.PHONY: logs-client
logs-client: ## Follow web-client logs
	$(COMPOSE) logs --follow client

.PHONY: ps
ps: ## Show service and health status
	$(COMPOSE) ps

.PHONY: shell-server
shell-server: ## Open a shell in the backend container
	$(COMPOSE) exec server sh

.PHONY: shell-postgres
shell-postgres: ## Open psql in the PostgreSQL container
	$(COMPOSE) exec postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'

.PHONY: shell-redis
shell-redis: ## Open an authenticated Redis shell
	$(COMPOSE) exec redis sh -c 'redis-cli -a "$$REDIS_PASSWORD" --no-auth-warning'

.PHONY: migrate
migrate: ## Apply database migrations in the running backend container
	$(COMPOSE) exec server pnpm run migration:run

.PHONY: install
install: ## Install all workspace dependencies from lockfiles
	cd crypto && pnpm install --frozen-lockfile
	cd client && pnpm install --frozen-lockfile
	cd pssmngr-server && pnpm install --frozen-lockfile

.PHONY: typecheck
typecheck: ## Type-check crypto, client, and backend workspaces
	cd crypto && pnpm run typecheck
	cd client && pnpm run typecheck
	cd pssmngr-server && pnpm run typecheck

.PHONY: lint
lint: ## Run repository linters without modifying files
	cd client && pnpm run lint:strict
	cd pssmngr-server && pnpm run format-and-lint

.PHONY: test
test: ## Run the supported unit test suites
	cd crypto && pnpm test
	cd client && pnpm run test
	cd pssmngr-server && pnpm run test

.PHONY: build
build: ## Build crypto, client, and backend workspaces
	cd crypto && pnpm run build
	cd client && pnpm run build
	cd pssmngr-server && pnpm run build

.PHONY: compose-config
compose-config: ## Validate and render the Docker Compose configuration
	$(COMPOSE) config --quiet
