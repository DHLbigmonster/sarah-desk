# Security Policy

## Reporting a vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Instead, open a [GitHub private security advisory](https://github.com/DHLbigmonster/sarah-desk/security/advisories/new) or email the maintainer directly via GitHub profile.

We will respond within 7 days and coordinate a disclosure timeline with you.

## Scope

- Credential leakage (`.env` handling, keychain storage)
- Privilege escalation via Accessibility / Input Monitoring APIs
- Remote code execution via agent subprocess spawning
- XSS or injection in the Electron renderer

## Out of scope

- Issues requiring physical access to the machine
- Denial-of-service against local processes
