.PHONY: setup verify run
 
setup:
	@mkdir -p artifacts evidence docs db/migrations db/seed src tests
	@bash scripts/preparar_env_local.sh
	@npm install
	@docker compose up -d --wait postgres
	@npm run migrate:bootstrap
	@npm run roles
	@npm run migrate
	@npm run seed
	@echo "M03 preparado"
 
verify:
	@bash scripts/verify_base.sh
	@bash scripts/check_no_secrets.sh
	@npm test
	@node scripts/generar_evidencia_m03.js
	@echo "M03 verificado"
 
run:
	@docker compose up