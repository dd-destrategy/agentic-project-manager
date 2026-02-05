# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Complete monorepo structure with 4 packages (core, lambdas, web, cdk)
- Phase 1-3 implementation planning (Sprints 0-19)
- DynamoDB single-table design with GSI and TTL configuration
- Claude API integration architecture with budget controls
- Jira Cloud integration via REST API v3
- Outlook integration design via Microsoft Graph API
- Two-pass triage pipeline (sanitise + classify)
- Hold queue system with 30-minute approval window
- Escalation workflow with decision presentation
- Autonomy levels and graduation ceremony design
- Mission Control dashboard architecture
- Budget degradation ladder (4 tiers)
- 10 comprehensive code reviews covering:
  - Security (prompt injection defences, IAM isolation)
  - Infrastructure (CDK stacks, cost optimisation)
  - Database (single-table design, access patterns)
  - Performance (Lambda cold starts, caching)
  - Frontend (Next.js App Router, SSR patterns)

### Security

- IAM isolation between triage and execution Lambda functions
- Prompt injection defences in two-pass triage
- Decision boundary enforcement with action allowlist
- Secrets Manager for all sensitive credentials
- Input validation with Zod schemas
- Lambda execution outside VPC (no NAT Gateway exposure)
