# Mis Gastos: backend

API REST de **Mis Gastos** (Java 25 + Spring Boot 4 + SQLite). En uso normal también sirve el frontend compilado, así que la aplicación completa funciona en un solo proceso y en un solo puerto.

La especificación funcional está en `../docs/specs/gastos-funcional.md`.

## Requisitos

- **Java 25** (JDK). Los scripts lo buscan con `/usr/libexec/java_home -v 25` en macOS; en otros sistemas define `JAVA_HOME` apuntando a un JDK 25.
- No hace falta instalar Maven: se usa el wrapper `./mvnw`.
- **Node.js y npm**, solo para compilar el frontend (`../gastosAppFronend`).

## Estructura de carpetas esperada

```
gastosApp/
├── gastosAppBackend/     este proyecto
├── gastosAppFronend/     frontend (React + Vite); su build queda en dist/
└── data/                 se crea sola (permisos 700): gastos.db, jwt-secret y backups/
```

## Arranque en uso normal

```bash
./start.sh
```

Luego abre <http://localhost:8080>. Por defecto solo escucha en `127.0.0.1`, así que solo es accesible desde este equipo (ver [Seguridad](#seguridad)).

`start.sh`:

1. Busca Java 25 y termina con un mensaje claro si no lo encuentra.
2. Compila el jar (`./mvnw package` sin pruebas) si falta o si cambió el código desde la última compilación.
3. Si existe `../gastosAppFronend` pero falta su `dist/`, lo compila con `npm ci && npm run build`. Si no puede hacerlo, avisa de cómo hacerlo a mano y arranca solo con la API.
4. Arranca la aplicación. Los argumentos se pasan a Spring Boot, por ejemplo `./start.sh --server.port=9090`.

Se detiene con `Ctrl+C`.

## Arranque en desarrollo

Backend con recarga desde el código fuente:

```bash
./mvnw spring-boot:run
```

Frontend con Vite en otra terminal (puerto 5173, con proxy de `/api` hacia el 8080):

```bash
cd ../gastosAppFronend
npm install
npm run dev
```

Si usas un Java distinto al 25 por defecto, antepón `JAVA_HOME=$(/usr/libexec/java_home -v 25)` (macOS) a los comandos de `./mvnw`.

## Variables de entorno

| Variable | Por defecto | Uso |
|---|---|---|
| `GASTOS_DATA_DIR` | `../data` | Carpeta con `gastos.db`, `jwt-secret` y `backups/` |
| `GASTOS_FRONTEND_DIR` | `../gastosAppFronend/dist` | Frontend compilado que sirve el backend. Si no existe, solo se sirve la API |
| `GASTOS_BIND_ADDRESS` | `127.0.0.1` | Dirección en la que escucha el servidor. Con el valor por defecto solo se puede abrir desde este equipo |
| `GASTOS_ALLOWED_HOSTS` | *(sin valor)* | Nombres adicionales aceptados en la cabecera `Host`, separados por comas (por ejemplo `mi-pc.local,mi-pc.local:9090`). Un nombre sin puerto vale con el puerto del servidor o sin puerto; con puerto, solo con ese puerto |
| `JWT_SECRET` | *(sin valor)* | Secreto para firmar los tokens (al menos 32 bytes). Si no se define, se genera uno aleatorio en el primer arranque y se guarda en `<GASTOS_DATA_DIR>/jwt-secret` con permisos solo para el dueño (600) |

Los valores por defecto (`../data` y `../gastosAppFronend/dist`) se resuelven respecto a la carpeta del backend, que la aplicación deduce de la ubicación del jar (o de `target/classes` en desarrollo), sin importar desde qué carpeta se arranque. `reset-password.sh` usa la misma resolución. Si das una ruta relativa en `GASTOS_DATA_DIR` o `GASTOS_FRONTEND_DIR`, se resuelve respecto a la carpeta del backend cuando arrancas con los scripts (se sitúan en ella) y respecto al directorio de trabajo en otro caso; usa rutas absolutas si tienes dudas.

Los tokens duran 24 horas y siguen valiendo tras reiniciar mientras no cambie el secreto. Si borras `jwt-secret` o cambias `JWT_SECRET`, todos los usuarios tendrán que volver a iniciar sesión.

Cambiar la contraseña invalida todas las sesiones abiertas de ese usuario: `PUT /api/auth/password` responde `200` con el mismo cuerpo que el login (`{token, user}`) y un token nuevo, y los tokens anteriores dejan de valer (`401`). Lo mismo ocurre al usar `reset-password.sh`.

## Pruebas

```bash
./mvnw test
```

Las pruebas usan bases SQLite desechables en `target/test-db/` y nunca tocan la carpeta de datos real.

## Respaldos

- Al arrancar, y cada 24 horas mientras corre, si no existe el respaldo del día se crea una copia consistente de la base (`VACUUM INTO`) en `<GASTOS_DATA_DIR>/backups/gastos-AAAA-MM-DD.db`.
- Se conservan los 14 respaldos más recientes; los anteriores se borran.
- Un fallo al respaldar queda en el log y no impide arrancar.

### Restaurar un respaldo

1. Detén la aplicación.
2. En la carpeta de datos, aparta la base actual y sus archivos auxiliares de SQLite:

   ```bash
   cd ../data            # o tu GASTOS_DATA_DIR
   mkdir -p descartada
   mv gastos.db gastos.db-wal gastos.db-shm descartada/ 2>/dev/null || true
   ```

3. Copia el respaldo elegido como nueva base:

   ```bash
   cp backups/gastos-2026-11-15.db gastos.db
   ```

4. Arranca de nuevo con `./start.sh`. Cuando compruebes que todo está bien, puedes borrar `descartada/`.

No borres solo `gastos.db` dejando `gastos.db-wal`: ese archivo pertenece a la base anterior.

## Restablecer una contraseña olvidada

No hay recuperación por correo. Desde la carpeta del backend:

```bash
./reset-password.sh <username>
```

Fija una contraseña temporal aleatoria y la muestra en la consola; el usuario entra con ella y la cambia desde la página **Cuenta**. No levanta el servidor web, así que se puede usar con la aplicación en marcha. Usa la misma carpeta de datos que la aplicación (`GASTOS_DATA_DIR` o `../data` junto a la carpeta del backend). Las sesiones abiertas de ese usuario dejan de valer. Si el usuario no existe, termina con error y no cambia nada.

## Seguridad

- **Solo local por defecto.** El servidor escucha en `127.0.0.1`. Exponerlo en la red (por ejemplo `GASTOS_BIND_ADDRESS=0.0.0.0`) es bajo tu responsabilidad: la aplicación no usa HTTPS, así que contraseñas y tokens viajarían sin cifrar por la red. Si lo haces, añade también el nombre o la IP con que lo abrirás a `GASTOS_ALLOWED_HOSTS`.
- **Cabecera `Host`.** Para evitar ataques de *DNS rebinding*, cualquier petición (API o frontend) cuya cabecera `Host` no sea `localhost`, `127.0.0.1` o `[::1]` (con el puerto del servidor o sin puerto), ni uno de `GASTOS_ALLOWED_HOSTS`, recibe `403`.
- **Cabeceras de seguridad** en todas las respuestas: `Content-Security-Policy` (solo recursos del mismo origen, sin scripts en línea), `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` y `X-Frame-Options: DENY`.
- Fuera de `/api` solo se aceptan `GET` y `HEAD` (el frontend compilado); otros métodos responden `405`.
- Contraseñas guardadas con BCrypt. En el login, el username admite como máximo 30 caracteres y la contraseña 72 bytes; si se superan, se responde `400` sin comprobar nada. Los usernames se normalizan a Unicode NFC al registrarse y al iniciar sesión.
- Tras 5 intentos fallidos seguidos de inicio de sesión para un mismo username (exista o no), se responde `429` durante 15 minutos (con la cabecera `Retry-After`), sin comprobar la contraseña. Igual con el cambio de contraseña: tras 5 `currentPassword` incorrectas seguidas para un usuario, `PUT /api/auth/password` responde `429` durante 15 minutos; un cambio correcto reinicia el contador. Los contadores viven en memoria y se reinician al reiniciar el backend.
- Los tokens incluyen una huella del hash de la contraseña (claim `pwd`); al cambiarla, los tokens anteriores dejan de valer.
- La carpeta de datos y `backups/` se crean con permisos 700, `jwt-secret` y los respaldos con 600. Si la carpeta de datos ya existía con permisos más abiertos, no se modifica: se avisa en el log (puedes corregirlo con `chmod 700 ../data`).
- No subas a ningún repositorio la carpeta de datos, `jwt-secret`, los respaldos ni archivos `.env` (ya están en `.gitignore`).
