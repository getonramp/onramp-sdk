# Contributing to the OnRamp SDKs

Thanks for helping improve OnRamp. This repository contains only the public SDKs, shared types, and their tests. The OnRamp application and infrastructure are maintained privately.

## Before opening an issue

- Search existing issues first.
- For implementation help, include the SDK, framework, and version you use.
- For bugs, include a minimal reproduction, expected behavior, actual behavior, and relevant platform details.
- Do not include API keys, personal data, or production event payloads.

## Local development

Requirements:

- Node.js 20 or 22
- pnpm 9

Install and verify the TypeScript packages:

```bash
pnpm install
pnpm typecheck
pnpm test
```

Use placeholder credentials in examples. Never commit `.env` files or real tokens.

## Pull requests

- Keep changes scoped to one problem.
- Add or update tests for SDK behavior changes.
- Run `pnpm typecheck`, `pnpm test`, and the relevant package build.
- Update the package README when public API behavior changes.
- Explain user-facing behavior and compatibility impact in the pull request.

By contributing, you agree that your contribution is licensed under the repository's MIT License.
