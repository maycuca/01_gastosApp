# Especificación Funcional: Sistema de Gestión de Gastos

## Descripción General
Mis Gastos (nombre interno del proyecto: gastosApp) es una aplicación web donde varios usuarios registran sus gastos, los clasifican por categoría y etiquetas, y los analizan en un dashboard por período. Cada usuario puede fijar un límite de gasto por período; al superarlo la app avisa, pero nunca impide registrar gastos.

## 1. Convenciones Generales

### Períodos (siempre calendario)
| Período | Enum | Desde | Hasta | Período anterior |
|---|---|---|---|---|
| Día | `DAY` | hoy | hoy | ayer |
| Semana | `WEEK` | lunes | domingo | semana anterior (lunes a domingo) |
| Quincena | `FORTNIGHT` | día 1 o día 16 | día 15 o último día del mes | quincena inmediata anterior |
| Mes | `MONTH` | día 1 | último día del mes | mes anterior |
| Año | `YEAR` | 1 de enero | 31 de diciembre | año anterior |

- La quincena anterior a la del 16–fin de mes es la del 1–15 del mismo mes; la anterior a la del 1–15 es la del 16–fin del mes previo.
- "Hoy" se calcula con la zona horaria del servidor (la app corre en local).
- Todos los rangos son inclusivos en ambos extremos.

### Dinero
- Moneda única; no se almacena símbolo ni código de moneda.
- En la API el monto viaja como número decimal con máximo 2 decimales (`amount`).
- En SQLite se guarda como entero en centavos (`amount_cents INTEGER`), porque SQLite no tiene tipo decimal exacto. La conversión ocurre en el backend.

### Fechas
- Formato ISO `YYYY-MM-DD` en la API; en SQLite se guardan como `TEXT` en ese formato.

### Autenticación
- JWT sin estado: `Authorization: Bearer <token>`, vigencia de 24 horas.
- Contraseñas con hash BCrypt (Spring Security).
- Cerrar sesión consiste en descartar el token en el frontend; no hay endpoint de logout.
- Todos los endpoints requieren token excepto `register` y `login`.
- Secreto de firma del JWT: se toma de la variable de entorno `JWT_SECRET`. Si no está definida, el backend genera uno aleatorio en el primer arranque y lo guarda en el directorio de datos (archivo `jwt-secret`, legible solo por el dueño) para reutilizarlo en los siguientes. El código no contiene ningún secreto por defecto.
- Normalización del username: antes de cualquier comparación (registro, login, límite de intentos y `reset-password.sh`) se quitan los espacios al inicio y al final y se normaliza a Unicode NFC; la comparación no distingue mayúsculas.
- Longitudes máximas: username 30 caracteres (tras normalizar) y contraseña 72 bytes en UTF-8 (límite de BCrypt). Se validan en registro, login y cambio de contraseña; si se superan, responde `400` con `fieldErrors` sin consultar la base ni verificar la contraseña.
- Límite de intentos de login: tras 5 intentos fallidos consecutivos para un mismo username normalizado, los siguientes intentos para ese username responden `429` durante 15 minutos, con la cabecera `Retry-After` en segundos. El `429` se responde antes de verificar la contraseña (ni siquiera se calcula el hash). Los usernames inexistentes también cuentan, igual que los existentes, para no revelar qué usuarios existen. Un login correcto reinicia el contador. El contador vive en memoria y se reinicia al reiniciar el backend.
- Límite de intentos del cambio de contraseña: tras 5 fallos consecutivos de `currentPassword` de un mismo usuario (identificado por el token), los siguientes intentos de cambio de ese usuario responden `429` durante 15 minutos, con `Retry-After` en segundos y sin verificar la contraseña. Un cambio correcto reinicia el contador. Es independiente del límite de login y también vive en memoria.
- Invalidación de tokens: al cambiar la contraseña (`PUT /api/auth/password`) o al restablecerla con `reset-password.sh`, todos los tokens emitidos antes para ese usuario dejan de valer y responden `401`, aunque no hayan vencido. El token devuelto por el cambio de contraseña sí vale.
- Contraseña olvidada: no hay recuperación por correo. Quien tiene acceso a la máquina puede restablecerla con una herramienta de línea de comandos del backend (ver sección 8).

### Aislamiento entre usuarios
- El usuario dueño de cada dato se toma siempre del token, nunca del body.
- Pedir un recurso de otro usuario responde `404`, igual que si no existiera.

### Formato de errores
```json
{
  "status": 400,
  "error": "Bad Request",
  "message": "Datos inválidos",
  "fieldErrors": [{"field": "amount", "message": "Debe ser mayor a 0"}]
}
```
`fieldErrors` solo aparece en errores de validación.

| Código | Cuándo |
|---|---|
| 400 | Validación fallida |
| 401 | Token ausente, inválido, vencido o emitido antes del último cambio o restablecimiento de contraseña; credenciales incorrectas |
| 403 | Cabecera `Host` no permitida (ver sección 8) |
| 404 | Recurso inexistente o de otro usuario |
| 409 | Duplicado (username, nombre de categoría) |
| 429 | Demasiados intentos fallidos de login para ese username, o de `currentPassword` en el cambio de contraseña para ese usuario |

### Entorno local
- Backend en `http://localhost:8080` (escucha solo en `127.0.0.1` por defecto, ver sección 8), frontend en `http://localhost:5173`.
- Vite redirige `/api` al backend mediante proxy, por lo que no se configura CORS.

## 2. Modelo de Datos

### User
```
- id: Long (PK)
- username: String (requerido, 3–30 caracteres, único sin distinguir mayúsculas; se normaliza quitando los espacios al inicio y al final y aplicando Unicode NFC, tanto al registrarse como al iniciar sesión)
- passwordHash: String (requerido)
- createdAt: LocalDateTime
```

### Category
```
- id: Long (PK)
- userId: Long (FK a User, requerido)
- name: String (requerido, 1–50 caracteres, único por usuario sin distinguir mayúsculas)
- color: String (requerido, formato #RRGGBB; se usa en los gráficos)
- createdAt: LocalDateTime
- updatedAt: LocalDateTime
```
- Las categorías no se pueden eliminar.
- Al registrarse, cada usuario recibe estas categorías: Comida, Transporte, Vivienda, Servicios, Salud, Entretenimiento, Otros.

### Expense
```
- id: Long (PK)
- userId: Long (FK a User, requerido)
- categoryId: Long (FK a Category, requerido)
- amountCents: Long (requerido, > 0)
- description: String (requerido, 1–255 caracteres)
- date: LocalDate (requerido, no puede ser futura, inmutable tras la creación)
- createdAt: LocalDateTime
- updatedAt: LocalDateTime
```

### Tag y ExpenseTag
```
Tag
- id: Long (PK)
- userId: Long (FK a User, requerido)
- name: String (requerido, 1–30 caracteres, único por usuario)

ExpenseTag (tabla de unión)
- expenseId: Long (FK a Expense)
- tagId: Long (FK a Tag)
```
- Los nombres de etiqueta se guardan en minúsculas y sin espacios al inicio o al final.
- Máximo 10 etiquetas por gasto.
- Las etiquetas se crean automáticamente al usarlas en un gasto.

### ExpenseLimit
```
- id: Long (PK)
- userId: Long (FK a User, requerido)
- period: Enum (DAY, WEEK, FORTNIGHT, MONTH, YEAR)
- limitCents: Long (requerido, > 0)
- createdAt: LocalDateTime
- updatedAt: LocalDateTime

Único por (userId, period)
```
El límite aplica a cada período de ese tipo (por ejemplo, un límite `MONTH` vale para todos los meses).

## 3. Endpoints REST

### Autenticación
| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| POST | `/api/auth/register` | `{username, password}` (password de 8 caracteres a 72 bytes) | `201` `{token, user: {id, username}}` |
| POST | `/api/auth/login` | `{username, password}` | `200` `{token, user: {id, username}}` |
| GET | `/api/auth/me` | — | `200` `{id, username}` |
| PUT | `/api/auth/password` | `{currentPassword, newPassword}` | `200` `{token, user: {id, username}}` |

Cambio de contraseña (`PUT /api/auth/password`, requiere token):
- `newPassword` sigue las reglas del registro (mínimo 8 caracteres, máximo 72 bytes).
- Si `currentPassword` no coincide, responde `400` con `fieldErrors` en el campo `currentPassword` (no `401`, para no confundirlo con una sesión vencida), y cuenta como fallo para el límite de intentos (sección 1).
- Si `newPassword` no cumple las reglas, responde `400` con `fieldErrors` en `newPassword`.
- Si el usuario está bloqueado por el límite de intentos, responde `429` con `Retry-After` sin verificar `currentPassword`.
- Si el cambio es correcto, responde `200` con el mismo cuerpo que el login: un token nuevo y el usuario. Todos los tokens anteriores del usuario, incluido el que hizo la petición, dejan de valer (`401`).

### Categorías
| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/api/categories` | — | `200` lista ordenada por nombre |
| POST | `/api/categories` | `{name, color}` | `201` categoría |
| PUT | `/api/categories/{id}` | `{name, color}` | `200` categoría |

Categoría: `{id, name, color}`. No existe `DELETE`.

### Gastos
| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| POST | `/api/expenses` | `{amount, description, date, categoryId, tags}` | `201` `{expense, exceededLimits}` |
| GET | `/api/expenses` | — | `200` página de gastos |
| GET | `/api/expenses/{id}` | — | `200` gasto |
| PUT | `/api/expenses/{id}` | `{amount, description, categoryId, tags}` | `200` `{expense, exceededLimits}` |
| DELETE | `/api/expenses/{id}` | — | `204` |

Gasto:
```json
{
  "id": 10,
  "amount": 150.50,
  "description": "Almuerzo",
  "date": "2026-11-15",
  "category": {"id": 1, "name": "Comida", "color": "#FF8A00"},
  "tags": ["trabajo"]
}
```

- `tags` es opcional; si se omite equivale a lista vacía.
- En `PUT` el body no incluye `date`; si llega, se ignora.
- `categoryId` de otro usuario o inexistente responde `404`.

Filtros de `GET /api/expenses` (todos opcionales y combinables):

| Parámetro | Efecto |
|---|---|
| `description` | Contiene el texto, sin distinguir mayúsculas |
| `categoryId` | Solo esa categoría |
| `startDate`, `endDate` | Rango de fechas inclusivo; se puede enviar solo uno |
| `tag` | Solo gastos con esa etiqueta |
| `page`, `size` | Paginación; `page` desde 0 hasta 100000, `size` 20 por defecto y 100 como máximo. Un `page` negativo o mayor que 100000 responde `400` con `fieldErrors` en `page` |

Orden fijo: fecha descendente y luego id descendente. Respuesta:
```json
{"content": [], "page": 0, "size": 20, "totalElements": 0, "totalPages": 0}
```

### Límites
| Método | Ruta | Body | Respuesta |
|---|---|---|---|
| GET | `/api/limits` | — | `200` lista con estado actual |
| PUT | `/api/limits/{period}` | `{limitAmount}` | `200` límite (crea o reemplaza) |
| DELETE | `/api/limits/{period}` | — | `204` |

Límite con estado del período en curso:
```json
{"period": "MONTH", "limitAmount": 5000.00, "spent": 4850.50, "remaining": 149.50, "exceeded": false}
```
`remaining` puede ser negativo.

### Dashboard
`GET /api/dashboard/summary?period=DAY|WEEK|FORTNIGHT|MONTH|YEAR` devuelve el período en curso de ese tipo:
```json
{
  "period": "MONTH",
  "from": "2026-11-01",
  "to": "2026-11-30",
  "totalSpent": 4850.50,
  "previousTotal": 3200.00,
  "changePercentage": 51.58,
  "limit": {"limitAmount": 5000.00, "remaining": 149.50, "percentageUsed": 97.01, "exceeded": false},
  "byCategory": [
    {"categoryId": 1, "name": "Comida", "color": "#FF8A00", "amount": 1500.00, "percentage": 30.92}
  ],
  "breakdown": [
    {"label": "2026-11-01", "amount": 150.00}
  ]
}
```

- `previousTotal` es el total del período anterior completo.
- `changePercentage` es `null` cuando `previousTotal` es 0.
- `limit` es `null` cuando el usuario no tiene límite para ese período.
- `byCategory` solo incluye categorías con gasto, ordenadas de mayor a menor monto.
- `breakdown`: para `WEEK`, `FORTNIGHT` y `MONTH` hay un punto por día (`label` = fecha); para `YEAR` un punto por mes (`label` = `YYYY-MM`); para `DAY` es una lista vacía. Los días o meses sin gasto aparecen con monto 0.

## 4. Reglas de Negocio

### Límites excedidos
- Un límite está excedido cuando lo gastado en el período es estrictamente mayor que el límite.
- Al crear o editar un gasto, el backend evalúa los límites de los períodos que contienen la fecha del gasto y devuelve los excedidos:
  ```json
  "exceededLimits": [{"period": "MONTH", "limitAmount": 5000.00, "spent": 5120.00}]
  ```
- Si ninguno está excedido, `exceededLimits` es una lista vacía.
- Un límite excedido nunca impide guardar el gasto.
- El backend solo informa el estado; el color de alerta lo decide el frontend.

### Categorías
- Solo se puede cambiar el nombre y el color.
- Al renombrar, los gastos existentes muestran el nombre nuevo.

### Gastos
- Solo el dueño puede ver, editar o eliminar un gasto.
- La eliminación es definitiva.

## 5. Frontend

Gráficos con Recharts. Toda petición usa la capa de servicios con el token guardado; ante un `401` se redirige al login.

### Sistema visual
El diseño evoca una libreta de cuentas del hogar.

| Elemento | Decisión |
|---|---|
| Fondo | Papel verde pálido `#EEF3EB`; superficies `#FAFCF7` |
| Texto | Tinta `#1B2440`; texto secundario `#566074` |
| Acción principal | Azul de bolígrafo `#2340B0` |
| Rojo `#C4201C` | Reservado para límite excedido ("números rojos"), errores y acciones destructivas |
| Resaltador `#FFE14A` | Marca dónde está el usuario: enlace activo del menú y pestaña activa |
| Tipografía | Archivo variable (autoalojada con `@fontsource-variable/archivo`); títulos y cifras en ancho condensado y peso alto, cifras tabulares |
| Estructura | Menú en columna izquierda separado del contenido por una doble línea de margen roja; en pantallas angostas pasa a la parte superior |
| Listas y tablas | Renglones separados por líneas verdes de libreta; sin sombras ni tarjetas redondeadas |

- El elemento protagonista es el total del período en el dashboard, en tamaño muy grande.
- Movimiento: solo la regla del límite se anima al cargar y el formulario modal al abrir; se respeta `prefers-reduced-motion`.
- Los botones conservan el mismo nombre en todo el flujo: "Agregar gasto" abre el formulario, lo envía, y el aviso dice "Gasto agregado.".

### Páginas
1. **Login / Registro.**
2. **Dashboard** (página inicial tras iniciar sesión):
   - Pestañas Día, Semana, Quincena, Mes y Año; se muestra un período a la vez y por defecto Mes.
   - El título indica el período en curso ("Hoy", "Esta semana", "Esta quincena", "Este mes", "Este año") con su rango de fechas.
   - Botón "Agregar gasto": abre el formulario de gasto sin salir del dashboard. Al guardar, el formulario se cierra, el resumen se actualiza, aparece el aviso "Gasto agregado." y, si la respuesta trae `exceededLimits`, la alerta de límites excedidos.
   - Total gastado del período y comparación con el período anterior (monto y porcentaje, indicando si subió o bajó).
   - Gráfico de gastos por categoría: una franja dividida en proporción al gasto, con el color de cada categoría, y la lista de montos y porcentajes.
   - Gráfico de barras de `breakdown` (se omite en la pestaña Día).
   - Si hay límite: una regla que compara lo gastado con el límite, con una marca en el límite. Si no hay límite, un enlace para fijarlo.
   - Si el límite está excedido: el total, el tramo de la regla que pasa de la marca y las barras del gráfico se muestran en rojo, y aparece un banner de alerta con el monto excedido.
3. **Gastos:**
   - Lista paginada con filtros por descripción, categoría, rango de fechas y etiqueta.
   - Agregar (botón "Agregar gasto"), editar y eliminar; eliminar pide confirmación.
   - El formulario de edición muestra la fecha como solo lectura.
   - Si la respuesta trae `exceededLimits`, se muestra una alerta que nombra los períodos excedidos.
4. **Categorías:** lista, crear y editar nombre y color. Sin opción de eliminar.
5. **Límites:** un renglón por período con gastado, límite y restante; permite fijar, cambiar o quitar el límite.
6. **Cuenta** (ruta `/cuenta`, accesible desde el nombre de usuario en el menú): formulario para cambiar la contraseña con contraseña actual y nueva. Al guardar, el frontend reemplaza el token guardado por el que devuelve la respuesta, muestra "Contraseña cambiada." y la sesión continúa sin pedir login.

En el login y en el cambio de contraseña, un `429` muestra un mensaje que indica que hay demasiados intentos y cuánto esperar.

### Estados
Cada vista maneja carga, error y vacío.

## 6. Criterios de Aceptación

### Autenticación y aislamiento
- [ ] Registrar un usuario crea sus 7 categorías iniciales.
- [ ] Un username repetido responde `409`.
- [ ] Sin token, cualquier endpoint protegido responde `401`.
- [ ] Un usuario no puede ver ni modificar gastos, categorías o límites de otro (`404`).

### Cuenta y seguridad
- [ ] Cambiar la contraseña con la actual correcta responde `200` con `{token, user}`; después solo la nueva sirve para iniciar sesión.
- [ ] Tras cambiar la contraseña, el token usado en la petición y cualquier otro emitido antes responden `401`; el token devuelto sí funciona.
- [ ] En la página Cuenta, tras cambiar la contraseña la sesión sigue abierta y las peticiones siguientes usan el token nuevo sin redirigir al login.
- [ ] Contraseña actual incorrecta o nueva demasiado corta responden `400` con `fieldErrors` en el campo correspondiente.
- [ ] Tras 5 fallos seguidos de `currentPassword` de un usuario, el siguiente cambio responde `429` con `Retry-After`, incluso con la contraseña actual correcta; no afecta a otros usuarios; pasado el plazo vuelve a funcionar, y un cambio correcto antes del quinto fallo reinicia el contador.
- [ ] Tras 5 logins fallidos seguidos para un username, el siguiente responde `429` con `Retry-After`, incluso con la contraseña correcta; pasado el plazo vuelve a funcionar.
- [ ] Con un username inexistente, el sexto intento seguido también responde `429` con `Retry-After`.
- [ ] Mientras dura el bloqueo, el `429` del login se responde sin verificar la contraseña.
- [ ] `" Ana "` y `"Ana"`, así como un username escrito en forma NFC y en forma NFD, se tratan como el mismo usuario en registro, login y límite de intentos.
- [ ] Un username de más de 30 caracteres o una contraseña de más de 72 bytes en UTF-8 responden `400` con `fieldErrors` en registro, login y cambio de contraseña.
- [ ] Sin `JWT_SECRET`, el backend genera y reutiliza un secreto propio; los tokens siguen valiendo tras reiniciar.
- [ ] La herramienta de restablecimiento deja al usuario entrar con la contraseña nueva, y los tokens emitidos antes del restablecimiento responden `401`.

### Ejecución y datos
- [ ] Con el frontend compilado, el backend sirve la aplicación completa en un solo puerto y las rutas de la interfaz (por ejemplo `/gastos`) cargan al recargar la página.
- [ ] Una ruta `/api/...` inexistente responde `404` en JSON, no la página.
- [ ] Al arrancar se crea el respaldo del día si no existe, y nunca se conservan más de 14.
- [ ] Sin `GASTOS_FRONTEND_DIR`, el backend sirve `../gastosAppFronend/dist`, y las rutas por defecto se resuelven igual aunque se arranque desde otro directorio de trabajo.
- [ ] Por defecto el servidor solo acepta conexiones en `127.0.0.1`; con `GASTOS_BIND_ADDRESS` escucha en la dirección indicada.
- [ ] Una petición con cabecera `Host` `localhost`, `127.0.0.1` o `[::1]` (sin puerto o con el puerto del servidor) se atiende; con otro host o con otro puerto responde `403`, salvo que esté en `GASTOS_ALLOWED_HOSTS`.
- [ ] Las respuestas (API y frontend) incluyen `Content-Security-Policy`, `X-Content-Type-Options`, `Referrer-Policy` y `X-Frame-Options` con los valores de la sección 8.
- [ ] La carpeta de datos creada por el backend tiene permisos `700` y los archivos de respaldo `600`.

### Paginación
- [ ] `page` negativo o mayor que 100000 responde `400` con `fieldErrors` en `page`.

### Gastos
- [ ] Se crea un gasto con monto, descripción, fecha, categoría y etiquetas opcionales.
- [ ] Monto ≤ 0, descripción vacía o fecha futura responden `400` con `fieldErrors`.
- [ ] Editar cambia monto, descripción, categoría y etiquetas; la fecha no cambia aunque se envíe.
- [ ] Eliminar responde `204` y el gasto deja de aparecer en lista y dashboard.
- [ ] El monto se conserva exacto con 2 decimales (por ejemplo, 0.10 + 0.20 suma 0.30).

### Filtros
- [ ] La búsqueda por descripción no distingue mayúsculas.
- [ ] Los filtros de categoría, etiqueta y rango de fechas (inclusivo) funcionan solos y combinados.
- [ ] La lista viene paginada y ordenada por fecha descendente.

### Categorías
- [ ] Se puede crear una categoría y cambiarle nombre y color.
- [ ] Un nombre repetido para el mismo usuario responde `409`.
- [ ] No existe forma de eliminar una categoría, ni en la API ni en la interfaz.

### Límites
- [ ] Se puede fijar, cambiar y quitar un límite por cada período.
- [ ] Al superar un límite, la respuesta de crear o editar el gasto lo incluye en `exceededLimits` y el gasto se guarda igual.
- [ ] Si una edición o eliminación deja el gasto por debajo del límite, la alerta desaparece.

### Dashboard
- [ ] Cada pestaña muestra el período calendario correcto; la quincena va del 1 al 15 o del 16 al fin de mes.
- [ ] La semana va de lunes a domingo.
- [ ] La comparación usa el período anterior completo.
- [ ] Con límite excedido, el total, el tramo excedido de la regla y las barras del gráfico se ven en rojo y aparece el banner de alerta.
- [ ] El gráfico por categoría usa el color de cada categoría.
- [ ] El botón "Agregar gasto" del dashboard abre el formulario; al guardar se cierra, el total se actualiza sin recargar la página y aparece "Gasto agregado.".
- [ ] El menú y las pestañas marcan la opción activa con el resaltador, y la interfaz es usable en pantalla angosta.

## 7. Consideraciones Técnicas

### Backend (Java 25 + Spring Boot 4)
- DTOs como `record`, validación con `@Valid`.
- Spring Security con filtro JWT y BCrypt.
- JPA sobre SQLite en modo WAL, pool de 1 conexión.
- Pruebas con JUnit 5 y MockMvc.

### Frontend (React + Vite + TypeScript)
- Componentes funcionales con hooks, TypeScript estricto.
- Servicios HTTP aislados.
- Proxy de Vite para `/api`.

## 8. Ejecución, Datos y Operación

### Directorios
| Variable | Por defecto | Contenido |
|---|---|---|
| `GASTOS_DATA_DIR` | `../data` | `gastos.db`, `jwt-secret`, `backups/` |
| `GASTOS_FRONTEND_DIR` | `../gastosAppFronend/dist` | Frontend compilado que sirve el backend |

- Las rutas por defecto se resuelven respecto a la carpeta del backend (`gastosAppBackend`), no al directorio de trabajo desde el que se arranca el proceso.
- Si el backend crea la carpeta de datos, lo hace con permisos `700` (solo el dueño). Los archivos de respaldo se crean con permisos `600`, igual que `jwt-secret`.

### Red y cabeceras HTTP
| Variable | Por defecto | Uso |
|---|---|---|
| `GASTOS_BIND_ADDRESS` | `127.0.0.1` | Dirección en la que escucha el servidor |
| `GASTOS_ALLOWED_HOSTS` | *(vacía)* | Hosts adicionales aceptados en la cabecera `Host`, separados por comas |

- Validación de la cabecera `Host`: se aceptan `localhost`, `127.0.0.1` y `[::1]` (sin puerto o con el puerto en el que escucha el servidor), más los de `GASTOS_ALLOWED_HOSTS`. Si la petición no trae cabecera `Host` (solo posible en HTTP/1.0), se valida el nombre del servidor local. Cualquier otro valor responde `403` con el formato de errores de la sección 1, para cualquier ruta.
- Todas las respuestas incluyen estas cabeceras de seguridad:

| Cabecera | Valor |
|---|---|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `X-Frame-Options` | `DENY` |

### Modo de uso normal (un solo proceso)
- El backend empaquetado sirve la API y el frontend compilado en el puerto 8080.
- Toda ruta que no empiece por `/api` y no corresponda a un archivo devuelve `index.html`, para que las rutas de la interfaz funcionen al recargar.
- Si `GASTOS_FRONTEND_DIR` no existe, el backend arranca igual y solo sirve la API.
- El backend incluye un script `start.sh` que arranca la aplicación con Java 25, compilando lo que falte.

El modo de desarrollo (Vite en el puerto 5173 con proxy a `/api`) sigue disponible.

### Respaldos
- Al arrancar, y cada 24 horas mientras corre, si no existe el respaldo del día se crea una copia consistente de la base en `backups/gastos-YYYY-MM-DD.db`.
- Se conservan los 14 respaldos más recientes; los anteriores se borran.
- Un fallo al respaldar se registra en el log y no impide arrancar.

### Restablecer una contraseña olvidada
- Script `reset-password.sh <username>` en el backend: fija una contraseña temporal aleatoria para ese usuario y la muestra en la consola. No levanta el servidor web.
- Los tokens emitidos antes del restablecimiento dejan de valer (`401`), también en un servidor que ya esté corriendo.
- Si el usuario no existe, termina con error y sin cambios.

### Compatibilidad de datos
- Una base creada con versiones anteriores sigue funcionando sin pasos manuales: si una versión necesita cambiar el esquema, el backend lo migra al arrancar sin perder datos.

## 9. Historial de Cambios
- v1.4 — `PUT /api/auth/password` responde `200` con `{token, user}` en lugar de `204`; cambiar o restablecer la contraseña invalida los tokens anteriores; límite de intentos de `currentPassword` (`429`); en el login los usernames inexistentes cuentan para el límite y el `429` no verifica la contraseña; longitudes máximas (username 30, contraseña 72 bytes) y username normalizado a NFC; `page` fuera de rango responde `400`; servidor solo en `127.0.0.1` por defecto (`GASTOS_BIND_ADDRESS`); validación de la cabecera `Host` (`403`, `GASTOS_ALLOWED_HOSTS`); cabeceras de seguridad; permisos `700` para la carpeta de datos y `600` para respaldos; rutas por defecto relativas a la carpeta del backend; carpetas renombradas a `gastosAppBackend` y `gastosAppFronend`.
- v1.4.1 — La validación de `Host` acepta solo el puerto del servidor (o ninguno); una petición HTTP/1.0 sin `Host` se valida con el nombre del servidor local. Alinea la spec con lo implementado y probado.
- v1.3 — Primera versión estable: cambio de contraseña y página Cuenta; restablecimiento por línea de comandos; límite de intentos de login (`429`); secreto JWT sin valor por defecto; backend sirve el frontend compilado; respaldos automáticos; directorios configurables; nombre visible "Mis Gastos".
- v1.0 — Especificación inicial.
- v1.2 — Botón "Agregar gasto" en el dashboard; sistema visual de libreta de cuentas; regla de límite en lugar de barra de progreso; gráfico por categoría como franja proporcional.
- v1.1 — Períodos calendario; dashboard con pestañas; montos en centavos; etiquetas en tabla propia con filtro; autenticación JWT; categorías iniciales y nombre único; paginación; formato de errores; `exceededLimits` en lugar de colores desde el backend; se eliminan email, perfil, descripción de categoría y `startDate` del límite.

## 10. Pendientes para Versiones Futuras

> Esta sección es un registro de ideas y faltantes conocidos. **Nada de lo que aparece aquí forma parte del contrato vigente**: ningún agente debe implementarlo hasta que se especifique en las secciones anteriores (endpoints, DTOs y criterios de aceptación) y se registre en el historial de cambios.

### Funcionalidad
- **Recuperar la contraseña desde la app.** Hoy solo existe `reset-password.sh` en la terminal. Propuesta recomendada: al registrarse, generar un código de recuperación de un solo uso que el usuario guarda; con él puede poner una contraseña nueva desde la pantalla de login, sin email ni servicios externos. La alternativa por email requiere guardar el email de cada usuario y configurar un servidor de correo. Al usar el código hay que invalidar los tokens anteriores, generar un código nuevo y limitar los intentos (`429`), igual que en el login.

### Seguridad y operación
- **Permisos de la base de datos.** `gastos.db` y sus archivos `-wal` y `-shm` se crean con permisos `644`; deberían ser `600`. Hoy los protege que la carpeta de datos sea `700`, pero si la carpeta ya existía con `755` la app solo avisa y no la corrige. Tampoco quedan en `700` las carpetas padre intermedias que crea el backend.
- **Enumeración de usuarios por tiempo de respuesta en el login.** Un username inexistente responde más rápido que uno existente con contraseña incorrecta, porque no se ejecuta BCrypt. Se corrige comparando contra un hash BCrypt ficticio cuando el usuario no existe.
- **Usernames guardados antes de la normalización NFC.** Un username guardado en NFD antes de v1.4 no coincidiría con el mismo nombre escrito en NFC. Habría que migrarlos a NFC al arrancar.

### Interfaz (pendientes menores conocidos)
- Posible pérdida momentánea del foco al guardar un límite.
- Un fallo de guardado no se muestra si se navega "atrás" durante el envío.
- Búsqueda ambigua en una rama de `ModalUsage.test.tsx`.
- Las flechas del teclado no mueven la selección entre las pestañas del dashboard.
- Icono de la aplicación pendiente de diseño propio.
- Sin verificar en Safari ni en Firefox, ni con teclados de composición reales.

### Publicación
- Subir la v1.0.0 a `github.com/maycuca/gastosAppBackend` y `github.com/maycuca/gastosAppFronend` (rama `main`, etiqueta `v1.0.0`).
