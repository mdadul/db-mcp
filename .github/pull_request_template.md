## What

<!-- One sentence: what does this PR do? -->

## Why

<!-- What problem does it solve, or what value does it add? -->

## Changes

<!-- Key files/modules touched and why -->

-

## How to test

<!-- Steps to verify this works. Include curl/MCP commands if relevant. -->

1.

## Checklist

- [ ] Backend: new DB type → added `case` to `dbExecutor.ts`, `getDatabaseSchema.ts`, `getTableSchema.ts`
- [ ] Frontend: new engine → added entry to `DB_ENGINES` in `types/index.ts`
- [ ] No credentials logged or returned in API responses
- [ ] Read-only enforcement: `assertReadOnly` still blocks write statements
- [ ] No `text-primary-foreground` on light backgrounds; no hardcoded `from-white`/`to-white`
- [ ] shadcn components used directly (no `className` overrides on variant-controlled props)
