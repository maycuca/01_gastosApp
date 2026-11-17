# Mis Gastos — frontend

Interfaz web de **Mis Gastos** (nombre interno del proyecto: gastosApp): registro de gastos por categoría y etiquetas, dashboard por período y límites de gasto. Implementa la sección 5 de `docs/specs/gastos-funcional.md` (v1.3).

Hecho con React, TypeScript estricto y Vite; gráficos con Recharts; pruebas con Vitest y React Testing Library.

## Requisitos

- Node.js 20.19 o superior (o 22.12 o superior) y npm.
- Para usar la aplicación, el backend del proyecto (carpeta `gastosAppBackend`) en marcha en el puerto 8080.

Instala las dependencias una vez:

```bash
npm install
```

## Desarrollo

```bash
npm run dev
```

Abre <http://localhost:5173>. El servidor de Vite redirige todas las peticiones a `/api` hacia el backend en `http://localhost:8080` (proxy definido en `vite.config.ts`), así que no hace falta configurar CORS. El backend debe estar arrancado aparte.

## Compilar

```bash
npm run build
```

Comprueba los tipos (`tsc -b`) y genera la versión de producción en `dist/`. Las páginas protegidas se cargan bajo demanda, de modo que el login y el registro no descargan el código del dashboard ni Recharts.

## Uso normal

En el uso diario no hace falta el servidor de Vite: el backend sirve la API y el contenido de `dist/` en un solo puerto, <http://localhost:8080>. Basta con compilar el frontend (`npm run build`) y arrancar el backend; las rutas de la interfaz (por ejemplo `/gastos`) funcionan también al recargar la página. Por defecto el backend busca el frontend compilado en `../gastosAppFronend/dist` (configurable con la variable `GASTOS_FRONTEND_DIR`; consulta la documentación del backend).

## Pruebas y lint

```bash
npm test             # Vitest, ejecución única
npm run test:watch   # Vitest en modo observación
npm run lint         # oxlint
```

Las pruebas no llaman a ninguna API real: sustituyen `fetch` por una API falsa (`src/test/fakeApi.ts`).

## Estructura

- `src/types/api.ts` — DTOs de la API tal como los define la spec.
- `src/services/` — cliente HTTP común (`httpClient.ts`) y un servicio por recurso.
- `src/context/`, `src/hooks/` — sesión y lógica de negocio (custom hooks).
- `src/components/`, `src/pages/` — interfaz.
- `src/utils/` — formato de montos y fechas, períodos, etiquetas, errores.
- `src/test/` — configuración de Vitest y utilidades de prueba.

Rutas: `/login`, `/registro`, `/` (dashboard), `/gastos`, `/categorias`, `/limites`, `/cuenta`.

La sesión se guarda en `localStorage` con la clave `gastosApp.token`; cerrar sesión descarta el token.
