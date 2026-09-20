#!/usr/bin/env bash
set -euo pipefail
 
if [ -f .env ]; then
  echo ".env ya existe, no se modifica"
  exit 0
fi
 
secreto() {
  python3 -c 'import secrets; print(secrets.token_urlsafe(24))'
}
 
cat > .env <<EOF
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=cdrl
POSTGRES_USER=cdrl_dev
POSTGRES_PASSWORD=$(secreto)
 
MIGRATOR_USER=cdrl_migrator
MIGRATOR_PASSWORD=$(secreto)
WRITER_USER=cdrl_writer
WRITER_PASSWORD=$(secreto)
READER_USER=cdrl_reader
READER_PASSWORD=$(secreto)
OPERATOR_USER=cdrl_operator
OPERATOR_PASSWORD=$(secreto)
 
DYNAMODB_PORT=8000
AWS_REGION=us-east-1
EOF
 
chmod 600 .env
echo ".env local generado. No lo subas a git."