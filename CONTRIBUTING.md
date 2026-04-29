# Contributing to Sarah

## Development setup

```bash
git clone https://github.com/DHLbigmonster/sarah-desk.git
cd sarah-desk
pnpm install
pnpm start
```

Copy `.env.example` to `.env` and fill in any credentials you want to test.

## Before submitting a PR

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm verify:mini
```

All four must pass.

## Pull requests

- Keep changes focused. One feature or fix per PR.
- Add or update tests for any logic changes.
- Do not commit `.env`, API keys, or machine-specific paths.

## Reporting bugs

Open a GitHub issue with:
- macOS version
- Steps to reproduce
- Relevant log lines from `~/Library/Logs/Sarah/main.log`
