# Reporte M02 — Modelo relacional operativo
 
## Que se agrega sobre M01
- Invariante: valor_min < valor_max en sensores (constraint que ya rechaza
  mal configurar un sensor).
- Invariante: una lectura fuera del rango de su sensor se rechaza directo en
  la base con un trigger, ya no depende solo del codigo de la app.
- Consulta parametrizada nueva: lecturas de un sensor entre dos fechas.
 
## Pruebas
- Caso normal: inserta una lectura valida, la consulta, y tambien prueba la
  consulta parametrizada por rango de fechas.
- Caso vacio: un sensor sin lecturas regresa un arreglo vacio.
- Caso limite: varias lecturas seguidas del mismo sensor.
- Fallo declarado: un valor fuera de rango se rechaza (ahora lo tumba la
  base con el trigger).
 
## Como correrlo
1. docker compose up -d postgres
2. npm install
3. npm run migrate
4. npm run seed
5. npm test
6. node scripts/generar_evidencia_m02.js
