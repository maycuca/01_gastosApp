# shellcheck shell=bash
# Shared helpers for start.sh and reset-password.sh. Sourced, not executed.

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JAR="$BACKEND_DIR/target/gastos-backend.jar"
# Spring Boot writes reproducible jars whose timestamp is fixed (1980), so the
# jar's own mtime cannot tell whether it is up to date; this marker is touched
# after each successful build instead.
BUILD_STAMP="$BACKEND_DIR/target/.gastos-build-stamp"
REQUIRED_JAVA=25

info() { printf '==> %s\n' "$*" >&2; }
warn() { printf 'AVISO: %s\n' "$*" >&2; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# Prints the major version (java.specification.version) of the given java binary.
java_major() {
  "$1" -XshowSettings:properties -version 2>&1 \
    | awk -F'= ' '/java.specification.version/ { gsub(/[[:space:]]/, "", $2); print $2; exit }'
}

# Sets JAVA_HOME and JAVA_BIN to a Java 25 installation or exits with a clear message.
find_java25() {
  local candidates=()
  if [[ -x /usr/libexec/java_home ]]; then
    local mac_home
    if mac_home="$(/usr/libexec/java_home -v "$REQUIRED_JAVA" 2>/dev/null)"; then
      candidates+=("$mac_home")
    fi
  fi
  if [[ -n "${JAVA_HOME:-}" ]]; then
    candidates+=("$JAVA_HOME")
  fi
  if command -v java >/dev/null 2>&1; then
    local path_java
    path_java="$(command -v java)"
    candidates+=("$(cd "$(dirname "$path_java")/.." && pwd)")
  fi

  local home
  for home in "${candidates[@]+"${candidates[@]}"}"; do
    if [[ -x "$home/bin/java" && "$(java_major "$home/bin/java")" == "$REQUIRED_JAVA" ]]; then
      export JAVA_HOME="$home"
      JAVA_BIN="$home/bin/java"
      return 0
    fi
  done

  fail "No se encontró Java $REQUIRED_JAVA, que es el que necesita Mis Gastos.
       Instala un JDK $REQUIRED_JAVA (por ejemplo Eclipse Temurin o IBM Semeru) y vuelve a intentarlo.
       En macOS se detecta solo con /usr/libexec/java_home -v $REQUIRED_JAVA; en otros sistemas
       define JAVA_HOME apuntando a esa instalación."
}

# True when the jar is missing or the sources or the pom changed since the last build.
jar_is_stale() {
  [[ ! -f "$JAR" || ! -f "$BUILD_STAMP" ]] && return 0
  [[ -n "$(find "$BACKEND_DIR/src/main" "$BACKEND_DIR/pom.xml" -newer "$BUILD_STAMP" -print -quit)" ]]
}

build_jar() {
  info "Compilando el backend (./mvnw package, sin pruebas)..."
  (cd "$BACKEND_DIR" && ./mvnw -q -DskipTests package) || fail "No se pudo compilar el backend."
  [[ -f "$JAR" ]] || fail "La compilación terminó pero no se encontró $JAR."
  touch "$BUILD_STAMP"
}
