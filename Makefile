.PHONY: setup verify run

setup:
	@mkdir -p artifacts evidence docs db/migrations db/seed src tests
	@bash scripts/preparar_env_local.sh
	@npm install
	@docker compose up -d --wait postgres
	@docker compose up -d dynamodb
	@npm run migrate:bootstrap
	@npm run roles
	@npm run migrate
	@npm run seed
	@npm run m05:tabla
	@echo "M05 preparado"

verify:
	@bash scripts/verify_base.sh
	@bash scripts/check_no_secrets.sh
	@npm test
	@node scripts/generar_evidencia_m03.js
	@node scripts/generar_evidencia_m05.js
	@echo "M05 verificado"

run:
	@docker compose up