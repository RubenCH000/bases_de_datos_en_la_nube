# Reporte M03 Seguridad relacional y mínimo privilegio
 
## Objetivo
 
En M03 se separaron los privilegios de PostgreSQL según la función de
cada conexión. La aplicación ya no utiliza una única cuenta con permisos
generales.
 
## Roles
 
| Rol | Permisos declarados |
| --- | --- |
| cdrl_migrator | Modificación de estructura y migraciones |
| cdrl_writer | Inserción de lecturas de telemetría |
| cdrl_reader | Consulta de datos |
| cdrl_operator | Conexión y health check sin acceso a datos |
 
El usuario administrador queda reservado para bootstrap, fixtures
sintéticos y configuración local. No se usa desde el servicio.
 
## Pruebas negativas
 
1. cdrl_reader intenta insertar una lectura.
2. cdrl_writer intenta borrar una lectura.
3. cdrl_operator intenta consultar lecturas_telemetria.
 
En los tres casos PostgreSQL debe devolver SQLSTATE 42501.
Las pruebas de M01 y M02 se conservan.
 
## Gestión y rotación de secretos
 
Las contraseñas no se guardan en Git. .env.example solo contiene nombres
de variables y .env está excluido mediante .gitignore.
 
Para rotar un secreto:
 
1. Generar una contraseña nueva.
2. Modificar únicamente el archivo local .env.
3. Ejecutar node scripts/configurar_roles.js.
4. Ejecutar npm test.
5. Reiniciar el proceso que use esas credenciales.
 
configurar_roles.js ejecuta ALTER ROLE cuando el rol ya existe. Nunca se
escribe la contraseña nueva en commits, README, issues, capturas o artifacts.
Si un secreto se expone, primero se rota y después se investiga la causa.
 
## Ejecución
 
make setup
make verify
make run
 
## Limitaciones
 
Docker Compose es el respaldo local reproducible. En AWS Academy los
secretos también deben proporcionarse por variables de entorno.