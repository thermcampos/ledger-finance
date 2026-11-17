#!/bin/bash
# Backend quality gate: compile, then the full test suite.
# Tests run on in-memory H2 (%test profile), so no Docker is needed.
# Requires JDK 21 — JDK 25 breaks Byte Buddy in every @QuarkusTest.
# Locally: `sdk use java 21.0.2-graalce` first (or `task quality:backend`, which does it).

CURRENT_DIR=$(pwd)

if [ ! -f "$CURRENT_DIR/pom.xml" ]; then
  cd "$CURRENT_DIR/backend" || exit 1
fi

JAVA_MAJOR=$(java -XshowSettings:properties -version 2>&1 | sed -n 's/^ *java.specification.version = //p')
if [ "$JAVA_MAJOR" != "21" ]; then
  echo "Backend tests need JDK 21, found '${JAVA_MAJOR:-none}'. Run: sdk use java 21.0.2-graalce"
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
