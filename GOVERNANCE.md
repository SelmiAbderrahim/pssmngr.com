# Governance

pssmngr is a maintainer-led open-source project. Current maintainers are listed in [MAINTAINERS.md](MAINTAINERS.md).

## Decisions

Routine decisions are made through issue and pull-request review. Maintainers seek technical consensus, with particular weight given to security evidence, compatibility, maintenance cost, and the zero-knowledge boundary. The lead maintainer makes the final decision when consensus is not practical.

Material changes to cryptography, the trust model, licensing, governance, data migrations, or product scope should begin with a public design issue unless confidentiality is required for an embargoed security fix.

## Releases

Maintainers approve releases after CI, build, migration, documentation, and secret-scanning gates pass. Release notes must distinguish shipped behavior from plans and identify breaking database or configuration changes.

## Security exceptions

Security reports and fixes may be developed privately until coordinated disclosure. After release, maintainers should publish enough information for operators to assess impact without exposing users unnecessarily.

## Changes to governance

Governance changes use normal pull requests and require approval from the lead maintainer. The repository history is the record of accepted changes.
