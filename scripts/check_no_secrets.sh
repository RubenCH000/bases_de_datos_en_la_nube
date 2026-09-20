#!/usr/bin/env bash
set -euo pipefail
 
echo "revisando secretos versionados..."
 
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "ERROR: .env esta versionado"
  exit 1
fi
 
if git grep -n 'cdrl_dev_[o]nly' >/dev/null 2>&1; then
  echo "ERROR: quedo la contrasena vieja en archivos versionados"
  exit 1
fi
 
if git grep -nE 'postgres(ql)?://[^[:space:]]+:[^[:space:]@]+@' \
  >/dev/null 2>&1; then
  echo "ERROR: posible cadena de conexion con password"
  exit 1
fi
 
if git grep -nE 'AKIA[0-9A-Z]{16}' >/dev/null 2>&1; then
  echo "ERROR: posible access key de AWS"
  exit 1
fi
 
if git grep -nE 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY' \
  >/dev/null 2>&1; then
  echo "ERROR: posible clave privada"
  exit 1
fi
 
python3 - <<'PY'
from pathlib import Path
 
archivo = Path('.env.example')
for linea in archivo.read_text().splitlines():
    if '_PASSWORD=' in linea or linea.startswith('POSTGRES_PASSWORD='):
        _, valor = linea.split('=', 1)
        if valor.strip():
            raise SystemExit(
                f'ERROR: password con valor en .env.example: {linea}'
            )
 
print('passwords de .env.example estan vacios')
PY
 
echo "sin secretos detectados en el arbol versionado"