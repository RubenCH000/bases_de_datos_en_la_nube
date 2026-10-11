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
	@npm run m06:tabla-audit
	@echo "M06 preparado"

verify:
	@bash scripts/verify_base.sh
	@bash scripts/check_no_secrets.sh
	@npm test
	@node scripts/generar_evidencia_m03.js
	@node scripts/generar_evidencia_m05.js
	@node --test tests/m06_auditoria_david.test.js
	@node scripts/generar_evidencia_m06.js
	@npm run m06:recuperacion
	@echo "M06 verificado"

run:
	@docker compose up