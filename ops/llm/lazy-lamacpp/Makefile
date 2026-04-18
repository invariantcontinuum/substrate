SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
MODELS := embeddings dense sparse reranker coding
LOG_RUN := $(ROOT)/scripts/run-with-log.sh

-include $(ROOT)/.env

.PHONY: help env env-token bootstrap install-prereqs systemd-install show configure download download-all replace start stop restart status logs start-all stop-all restart-all status-all logs-all sample sample-all test-sequence lora-config lora-download lora-activate lora-deactivate

MODEL_CHECK = if [[ -z "$(MODEL)" ]]; then echo "MODEL is required. Use one of: $(MODELS)" >&2; exit 1; fi; if [[ " $(MODELS) " != *" $(MODEL) "* ]]; then echo "Unknown MODEL=$(MODEL). Use one of: $(MODELS)" >&2; exit 1; fi;
LORA_CHECK = if [[ -z "$(LORA)" ]]; then echo "LORA is required" >&2; exit 1; fi;

help:
	@$(LOG_RUN) help printf '%s\n' \
	  'make install-prereqs                   Build llama.cpp and install local prerequisites' \
	  'make systemd-install                   Install or refresh the user-level systemd units' \
	  'make show MODEL=<name>                 Show the resolved config for a model' \
	  'make configure MODEL=<name> ...        Persist model overrides like DEVICE=cpu PORT=8105 HF_REPO=... HF_FILE=...' \
	  'make download MODEL=<name>             Download the configured model from Hugging Face' \
	  'make download-all                      Download every configured model' \
	  'make replace MODEL=<name> HF_REPO=... HF_FILE=... [HF_PATTERN=glob]' \
	  'make start MODEL=<name> [DEVICE=cpu|gpu] [GPU_LAYERS=..] [CTX_SIZE=..]' \
	  'make stop MODEL=<name>' \
	  'make restart MODEL=<name> [DEVICE=cpu|gpu]' \
	  'make status MODEL=<name>' \
	  'make logs MODEL=<name> [LINES=200]' \
	  'make start-all | stop-all | restart-all | status-all | logs-all' \
	  'make sample MODEL=<name> [SAMPLE=<name>]' \
	  'make sample-all [SAMPLE_MODELS="embeddings dense sparse reranker coding"]' \
	  'make test-sequence [TEST_MODELS="dense sparse reranker coding"]' \
	  'make lora-config MODEL=dense LORA=cypher HF_REPO=... HF_FILE=...' \
	  'make lora-download MODEL=dense LORA=cypher' \
	  'make lora-activate MODEL=dense LORAS=cypher,policy' \
	  'make lora-deactivate MODEL=dense' \
	  'make env-token HF_TOKEN=hf_xxx'

env:
	@$(LOG_RUN) env bash -lc '[[ -f "$(ROOT)/.env" ]] || cp "$(ROOT)/.env.example" "$(ROOT)/.env"; printf "%s\n" "$(ROOT)/.env"'

env-token:
	@$(LOG_RUN) env-token bash -lc 'if [[ -z "$(HF_TOKEN)" ]]; then echo "HF_TOKEN is required" >&2; exit 1; fi; ./scripts/set-env-var.sh HF_TOKEN "$(HF_TOKEN)"'

bootstrap:
	@$(LOG_RUN) bootstrap bash -lc '$(MAKE) --no-print-directory install-prereqs; $(MAKE) --no-print-directory systemd-install'

install-prereqs:
	@$(LOG_RUN) install-prereqs ./scripts/install-prereqs.sh

systemd-install:
	@$(LOG_RUN) systemd-install ./scripts/systemd-install.sh

show:
	@$(LOG_RUN) show bash -lc '$(MODEL_CHECK) ./scripts/show-model.sh "$(MODEL)"'

configure:
	@$(LOG_RUN) configure bash -lc '$(MODEL_CHECK) args=(); \
	  [[ -n "$(DEVICE)" ]] && args+=("DEVICE=$(DEVICE)"); \
	  [[ -n "$(PORT)" ]] && args+=("PORT=$(PORT)"); \
	  [[ -n "$(HOST)" ]] && args+=("HOST=$(HOST)"); \
	  [[ -n "$(CTX_SIZE)" ]] && args+=("CTX_SIZE=$(CTX_SIZE)"); \
	  [[ -n "$(THREADS)" ]] && args+=("THREADS=$(THREADS)"); \
	  [[ -n "$(GPU_LAYERS)" ]] && args+=("GPU_LAYERS=$(GPU_LAYERS)"); \
	  [[ -n "$(CPU_BATCH)" ]] && args+=("CPU_BATCH=$(CPU_BATCH)"); \
	  [[ -n "$(CPU_UBATCH)" ]] && args+=("CPU_UBATCH=$(CPU_UBATCH)"); \
	  [[ -n "$(GPU_BATCH)" ]] && args+=("GPU_BATCH=$(GPU_BATCH)"); \
	  [[ -n "$(GPU_UBATCH)" ]] && args+=("GPU_UBATCH=$(GPU_UBATCH)"); \
	  [[ -n "$(DISPLAY_NAME)" ]] && args+=("DISPLAY_NAME=$(DISPLAY_NAME)"); \
	  [[ -n "$(SOURCE_REPO)" ]] && args+=("SOURCE_REPO=$(SOURCE_REPO)"); \
	  [[ -n "$(HF_REPO)" ]] && args+=("HF_REPO=$(HF_REPO)"); \
	  [[ -n "$(HF_FILE)" ]] && args+=("HF_FILE=$(HF_FILE)"); \
	  [[ -n "$(HF_PATTERN)" ]] && args+=("HF_PATTERN=$(HF_PATTERN)"); \
	  [[ -n "$(HF_REVISION)" ]] && args+=("HF_REVISION=$(HF_REVISION)"); \
	  [[ -n "$(EXTRA_ARGS)" ]] && args+=("EXTRA_ARGS=$(EXTRA_ARGS)"); \
	  if (( $${#args[@]} == 0 )); then echo "No overrides passed"; exit 0; fi; \
	  ./scripts/configure-model.sh "$(MODEL)" "$${args[@]}"'

download:
	@$(LOG_RUN) download bash -lc '$(MODEL_CHECK) ./scripts/download-model.sh "$(MODEL)"'

download-all:
	@$(LOG_RUN) download-all bash -lc 'for model in $(MODELS); do \
	  $(MAKE) --no-print-directory download MODEL="$$model"; \
	done'

replace:
	@$(LOG_RUN) replace bash -lc '$(MODEL_CHECK) if [[ -z "$(HF_REPO)" || -z "$(HF_FILE)" ]]; then echo "HF_REPO and HF_FILE are required" >&2; exit 1; fi; args=("HF_REPO=$(HF_REPO)" "HF_FILE=$(HF_FILE)"); \
	  [[ -n "$(HF_PATTERN)" ]] && args+=("HF_PATTERN=$(HF_PATTERN)"); \
	  [[ -n "$(HF_REVISION)" ]] && args+=("HF_REVISION=$(HF_REVISION)"); \
	  [[ -n "$(SOURCE_REPO)" ]] && args+=("SOURCE_REPO=$(SOURCE_REPO)"); \
	  [[ -n "$(DISPLAY_NAME)" ]] && args+=("DISPLAY_NAME=$(DISPLAY_NAME)"); \
	  [[ -n "$(DEVICE)" ]] && args+=("DEVICE=$(DEVICE)"); \
	  ./scripts/replace-model.sh "$(MODEL)" "$${args[@]}"'

start:
	@$(LOG_RUN) start bash -lc '$(MODEL_CHECK) ./scripts/systemd-install.sh; args=(); \
	  [[ -n "$(DEVICE)" ]] && args+=("DEVICE=$(DEVICE)"); \
	  [[ -n "$(CTX_SIZE)" ]] && args+=("CTX_SIZE=$(CTX_SIZE)"); \
	  [[ -n "$(THREADS)" ]] && args+=("THREADS=$(THREADS)"); \
	  [[ -n "$(GPU_LAYERS)" ]] && args+=("GPU_LAYERS=$(GPU_LAYERS)"); \
	  [[ -n "$(CPU_BATCH)" ]] && args+=("CPU_BATCH=$(CPU_BATCH)"); \
	  [[ -n "$(CPU_UBATCH)" ]] && args+=("CPU_UBATCH=$(CPU_UBATCH)"); \
	  [[ -n "$(GPU_BATCH)" ]] && args+=("GPU_BATCH=$(GPU_BATCH)"); \
	  [[ -n "$(GPU_UBATCH)" ]] && args+=("GPU_UBATCH=$(GPU_UBATCH)"); \
	  [[ -n "$(EXTRA_ARGS)" ]] && args+=("EXTRA_ARGS=$(EXTRA_ARGS)"); \
	  if (( $${#args[@]} > 0 )); then ./scripts/configure-model.sh "$(MODEL)" "$${args[@]}"; fi; \
	  systemctl --user start "llamacpp-model@$(MODEL).service"; \
	  sleep 1; \
	  systemctl --user --no-pager --full status "llamacpp-model@$(MODEL).service"'

stop:
	@$(LOG_RUN) stop bash -lc '$(MODEL_CHECK) systemctl --user stop "llamacpp-model@$(MODEL).service"'

restart:
	@$(LOG_RUN) restart bash -lc '$(MODEL_CHECK) ./scripts/systemd-install.sh; args=(); \
	  [[ -n "$(DEVICE)" ]] && args+=("DEVICE=$(DEVICE)"); \
	  [[ -n "$(CTX_SIZE)" ]] && args+=("CTX_SIZE=$(CTX_SIZE)"); \
	  [[ -n "$(THREADS)" ]] && args+=("THREADS=$(THREADS)"); \
	  [[ -n "$(GPU_LAYERS)" ]] && args+=("GPU_LAYERS=$(GPU_LAYERS)"); \
	  [[ -n "$(CPU_BATCH)" ]] && args+=("CPU_BATCH=$(CPU_BATCH)"); \
	  [[ -n "$(CPU_UBATCH)" ]] && args+=("CPU_UBATCH=$(CPU_UBATCH)"); \
	  [[ -n "$(GPU_BATCH)" ]] && args+=("GPU_BATCH=$(GPU_BATCH)"); \
	  [[ -n "$(GPU_UBATCH)" ]] && args+=("GPU_UBATCH=$(GPU_UBATCH)"); \
	  [[ -n "$(EXTRA_ARGS)" ]] && args+=("EXTRA_ARGS=$(EXTRA_ARGS)"); \
	  if (( $${#args[@]} > 0 )); then ./scripts/configure-model.sh "$(MODEL)" "$${args[@]}"; fi; \
	  systemctl --user restart "llamacpp-model@$(MODEL).service"; \
	  sleep 1; \
	  systemctl --user --no-pager --full status "llamacpp-model@$(MODEL).service"'

status:
	@$(LOG_RUN) status bash -lc '$(MODEL_CHECK) systemctl --user --no-pager --full status "llamacpp-model@$(MODEL).service"'

logs:
	@$(LOG_RUN) logs bash -lc '$(MODEL_CHECK) journalctl --user -u "llamacpp-model@$(MODEL).service" -n "$(or $(LINES),200)" --no-pager'

start-all:
	@$(LOG_RUN) start-all bash -lc './scripts/systemd-install.sh; systemctl --user start llamacpp-stack.target; sleep 1; systemctl --user --no-pager --full status llamacpp-stack.target $(foreach model,$(MODELS),llamacpp-model@$(model).service)'

stop-all:
	@$(LOG_RUN) stop-all systemctl --user stop llamacpp-stack.target

restart-all:
	@$(LOG_RUN) restart-all systemctl --user restart $(foreach model,$(MODELS),llamacpp-model@$(model).service)

status-all:
	@$(LOG_RUN) status-all systemctl --user --no-pager --full status llamacpp-stack.target $(foreach model,$(MODELS),llamacpp-model@$(model).service)

logs-all:
	@$(LOG_RUN) logs-all journalctl --user \
	  $(foreach model,$(MODELS),-u llamacpp-model@$(model).service) \
	  -n "$(or $(LINES),200)" \
	  --no-pager

sample:
	@$(LOG_RUN) sample bash -lc '$(MODEL_CHECK) ./scripts/run-sample.sh "$(MODEL)" "$(SAMPLE)"'

sample-all:
	@$(LOG_RUN) sample-all bash -lc 'models=($(or $(SAMPLE_MODELS),$(MODELS))); ./scripts/run-samples-all.sh "$${models[@]}"'

test-sequence:
	@$(LOG_RUN) test-sequence bash -lc 'models=($(or $(TEST_MODELS),$(MODELS))); ./scripts/test-sequence.sh "$${models[@]}"'

lora-config:
	@$(LOG_RUN) lora-config bash -lc '$(MODEL_CHECK) $(LORA_CHECK) args=(); \
	  [[ -n "$(ENABLED)" ]] && args+=("ENABLED=$(ENABLED)"); \
	  [[ -n "$(HF_REPO)" ]] && args+=("HF_REPO=$(HF_REPO)"); \
	  [[ -n "$(HF_FILE)" ]] && args+=("HF_FILE=$(HF_FILE)"); \
	  [[ -n "$(HF_PATTERN)" ]] && args+=("HF_PATTERN=$(HF_PATTERN)"); \
	  [[ -n "$(HF_REVISION)" ]] && args+=("HF_REVISION=$(HF_REVISION)"); \
	  [[ -n "$(SCALE)" ]] && args+=("SCALE=$(SCALE)"); \
	  if (( $${#args[@]} == 0 )); then echo "No LoRA overrides passed"; exit 0; fi; \
	  ./scripts/configure-lora.sh "$(MODEL)" "$(LORA)" "$${args[@]}"'

lora-download:
	@$(LOG_RUN) lora-download bash -lc '$(MODEL_CHECK) $(LORA_CHECK) ./scripts/download-lora.sh "$(MODEL)" "$(LORA)"'

lora-activate:
	@$(LOG_RUN) lora-activate bash -lc '$(MODEL_CHECK) if [[ -z "$(LORAS)" && -z "$(LORA)" ]]; then echo "Pass LORAS=name1,name2 or LORA=name" >&2; exit 1; fi; ./scripts/set-active-loras.sh "$(MODEL)" "$(or $(LORAS),$(LORA))"'

lora-deactivate:
	@$(LOG_RUN) lora-deactivate bash -lc '$(MODEL_CHECK) ./scripts/set-active-loras.sh "$(MODEL)" ""'
