# Security policy

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/SelmiAbderrahim/pssmngr/security/advisories/new). Do not open a public issue, pull request, or discussion with exploit details.

Include:

- the affected commit or release;
- impact and the security boundary involved;
- reproducible steps or a minimal proof of concept;
- suggested mitigations, if known;
- whether any third party may already know about the issue.

Use synthetic accounts and data. Never send real master passwords, Secret Keys, vault keys, session tokens, private keys, database contents, or user exports.

If private vulnerability reporting is temporarily unavailable, contact the lead maintainer through the GitHub profile in [MAINTAINERS.md](MAINTAINERS.md) and request a private channel without disclosing the vulnerability details publicly.

## What happens next

Maintainers will validate the report, assess affected versions, coordinate a fix and release, and credit the reporter if requested and appropriate. Disclosure timing is coordinated based on exploitability, patch availability, and downstream risk; no fixed response or release deadline is promised.

Please allow a reasonable remediation window before publication. If you believe users face active exploitation or immediate harm, state that clearly in the private report.

## Supported versions

Security fixes target the latest release and the current `main` branch. Older releases may require upgrading. Until the first tagged public release, only `main` is supported.

## Scope

High-priority reports include plaintext or key-material exposure, authentication or authorization bypass, cross-user or cross-organization access, cryptographic misuse, unsafe recovery/sharing behavior, remote code execution, injection, and secrets published in release artifacts.

Availability issues that require overwhelming traffic, social engineering without a technical flaw, and findings from automated scanners without a demonstrated impact may receive lower priority.

The project does not claim an independent third-party security audit. See [ARCHITECTURE.md](ARCHITECTURE.md) for the documented threat model and limitations.
