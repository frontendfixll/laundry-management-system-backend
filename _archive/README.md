# Archive

This folder contains historical one-off scripts and obsolete docs that were previously at the backend root.

They've been moved here to declutter the project, but are preserved in git history and on disk for reference.

## Contents

### `/scripts` (126 files)
One-time utility scripts: check-*, debug-*, create-test-*, reset-*, fix-*, setup-*, seed-*, migration scripts.

These were used for debugging issues, creating test data, resetting passwords during development, etc. Most are no longer relevant since the bugs they fixed are resolved or the test data has been superseded.

**If you need to re-run one:** copy it back to root or run via absolute path — they still work.

### `/docs` (9 files)
Obsolete markdown notes: task completion summaries, one-time fix notes, implementation progress logs.

These served their purpose during development and are kept only for historical context.

## Rule of thumb
- Anything that belongs in production code → `src/`
- Anything that's a repeatable maintenance script → `scripts/`
- Everything else → here or delete
