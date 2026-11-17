#!/usr/bin/env bash
# Sets a random temporary password for a user and prints it (spec section 8).
# Does not start the web server, so it can be used while the app is running.
# Uses the same data directory as the app: GASTOS_DATA_DIR, or ../data next to
# the backend folder (resolved from the jar's location, not the working directory).
# Changing the password also invalidates the user's current sessions (tokens).
#
#   ./reset-password.sh <username>
set -euo pipefail

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/scripts/common.sh"
cd "$BACKEND_DIR"

if [[ $# -ne 1 || -z "${1// /}" ]]; then
  printf 'Uso: %s <username>\n' "$0" >&2
  exit 2
fi

find_java25

# Rebuilding is safe for an instance started with start.sh (it runs its own copy).
if jar_is_stale; then
  build_jar
fi

exec "$JAVA_BIN" --enable-native-access=ALL-UNNAMED -jar "$JAR" reset-password "$1"
