#!/usr/bin/env bash
# Starts Mis Gastos (API + compiled frontend) in a single process with Java 25.
# Builds the backend jar if it is missing or out of date, and the frontend if
# the sibling folder ../gastosAppFronend exists without its dist/ build.
# Any argument is passed to the application, e.g. ./start.sh --server.port=18080
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/common.sh"
# The default directories (../data, ../gastosAppFronend/dist) are resolved by the
# application from the location of the jar, whatever the working directory. Relative
# values given in GASTOS_DATA_DIR or GASTOS_FRONTEND_DIR are resolved from here.
cd "$BACKEND_DIR"

find_java25
info "Java: $JAVA_HOME"

if jar_is_stale; then
  build_jar
fi

FRONTEND_SOURCES="$BACKEND_DIR/../gastosAppFronend"
if [[ -n "${GASTOS_FRONTEND_DIR:-}" ]]; then
  if [[ ! -f "$GASTOS_FRONTEND_DIR/index.html" ]]; then
    warn "GASTOS_FRONTEND_DIR=$GASTOS_FRONTEND_DIR no contiene index.html; solo se servirá la API."
  fi
elif [[ -d "$FRONTEND_SOURCES" && ! -f "$FRONTEND_SOURCES/dist/index.html" ]]; then
  if command -v npm >/dev/null 2>&1; then
    info "El frontend no está compilado; compilándolo (npm ci && npm run build)..."
    if ! (cd "$FRONTEND_SOURCES" && npm ci && npm run build); then
      warn "No se pudo compilar el frontend; se servirá solo la API.
       Para compilarlo a mano: cd ../gastosAppFronend && npm ci && npm run build"
    fi
  else
    warn "El frontend no está compilado y no se encontró npm; se servirá solo la API.
       Instala Node.js y ejecuta: cd ../gastosAppFronend && npm ci && npm run build"
  fi
fi

# Run a private copy of the jar so that rebuilding (./mvnw package) never
# overwrites the file a running instance is using.
RUN_DIR="$BACKEND_DIR/target/run"
mkdir -p "$RUN_DIR"
cp "$JAR" "$RUN_DIR/.gastos-backend.jar.tmp"
mv -f "$RUN_DIR/.gastos-backend.jar.tmp" "$RUN_DIR/gastos-backend.jar"

info "Arrancando Mis Gastos..."
exec "$JAVA_BIN" --enable-native-access=ALL-UNNAMED -jar "$RUN_DIR/gastos-backend.jar" "$@"
