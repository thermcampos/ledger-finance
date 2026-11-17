#!/bin/bash
# Backend quality gate: compile, then the full test suite.
# Tests run on in-memory H2 (%test profile), so no Docker is needed.
# Requires JDK 25 — Quarkus 3.40 ships a Byte Buddy that understands Java 25 class files.
# Locally: `sdk use java 25.0.5.1-graal` first (or `task quality-check-backend`, which does it).

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# The JWT key pair is gitignored but @QuarkusTest loads it from the classpath
# (backend/src/main/resources/*.pem). Generate it when missing (fresh clone / CI);
# existing local keys are left untouched.
(cd "$REPO_ROOT" && bash scripts/generate-jwt-keys.sh)
if [ $? -ne 0 ]; then
  echo "Issues when generating JWT keys. Please review.."
  exit 1
fi

cd "$REPO_ROOT/backend" || exit 1

JAVA_MAJOR=$(java -XshowSettings:properties -version 2>&1 | sed -n 's/^ *java.specification.version = //p')
if [ "$JAVA_MAJOR" != "25" ]; then
  echo "Backend tests need JDK 25, found '${JAVA_MAJOR:-none}'. Run: sdk use java 25.0.5.1-graal"
  exit 1
fi

echo "Running checks..."
echo "1/2 - Build started..."
./mvnw --no-transfer-progress clean compile -DskipTests
if [ $? -ne 0 ]; then
  echo "Issues when running build. Please review.."
  exit 1
fi

echo "2/2 - Tests started..."
./mvnw --no-transfer-progress test
if [ $? -ne 0 ]; then
  echo "Issues when running test. Please review.."
  exit 1
fi

echo "You're good to go! Good job!"
exit 0
