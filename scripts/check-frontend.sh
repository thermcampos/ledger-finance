#!/bin/bash
# Frontend quality gate: install, lint, build, unit tests, light/dark palette contrast.

CURRENT_DIR=$(pwd)

if [ ! -f "$CURRENT_DIR/package.json" ]; then
  cd "$CURRENT_DIR/frontend" || exit 1
fi

npm ci --no-update-notifier
if [ $? -ne 0 ]; then
  echo "Issues when installing dependencies. Please review.."
  exit 1
fi

echo "Running checks..."
echo "1/4 - Lint started..."
npm run lint
if [ $? -ne 0 ]; then
  echo "Issues when running lint. Please review.."
  exit 1
fi

echo "2/4 - Build started..."
npm run build
if [ $? -ne 0 ]; then
  echo "Issues when running build. Please review.."
  exit 1
fi

echo "3/4 - Tests started..."
npm run test
if [ $? -ne 0 ]; then
  echo "Issues when running test. Please review.."
  exit 1
fi

echo "4/4 - Contrast check started..."
npm run check:contrast
if [ $? -ne 0 ]; then
  echo "Issues when running contrast check. Please review.."
  exit 1
fi

echo "You're good to go! Good job!"
exit 0
