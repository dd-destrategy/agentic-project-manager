# Contributing to Agentic PM Workbench

Thank you for your interest in contributing to the Agentic PM Workbench. This
document provides guidelines and instructions for contributing.

## Table of Contents

- [Development Setup](#development-setup)
- [Code Style Guidelines](#code-style-guidelines)
- [Testing Requirements](#testing-requirements)
- [Pull Request Process](#pull-request-process)
- [Commit Message Format](#commit-message-format)

---

## Development Setup

### Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0
- **Docker** and Docker Compose (for local development)
- **AWS CLI** configured with appropriate permissions
- **AWS CDK CLI** (`npm install -g aws-cdk`)

### Getting Started

```bash
# 1. Clone the repository
git clone https://github.com/user/agentic-project-manager.git
cd agentic-project-manager

# 2. Install dependencies
pnpm install

# 3. Start local services (DynamoDB Local, LocalStack, MailHog)
docker-compose up -d

# 4. Verify services are running
docker-compose ps

# 5. Run the test suite
pnpm test

# 6. Run type checking
pnpm typecheck

# 7. Start the Next.js frontend in development mode
pnpm dev
```

### Local Services

| Service        | URL                   | Purpose              |
| -------------- | --------------------- | -------------------- |
| DynamoDB Local | http://localhost:8000 | Database             |
| DynamoDB Admin | http://localhost:8001 | Database UI          |
| LocalStack     | http://localhost:4566 | SES, Secrets Manager |
| MailHog        | http://localhost:8025 | Email testing UI     |

---

## Code Style Guidelines

### TypeScript

- **Strict mode** is mandatory - no `any` types
- **Explicit return types** on all functions
- **Zod** for runtime schema validation
- **British English** in comments, strings, and documentation

### Formatting and Linting

- **Prettier** for code formatting
- **ESLint** for linting

```bash
# Format code
pnpm format

# Check formatting
pnpm format:check

# Run linting
pnpm lint
```

### File Organisation

- Place shared business logic in `packages/core`
- Lambda handlers go in `packages/lambdas`
- Frontend code lives in `packages/web`
- Infrastructure code belongs in `packages/cdk`

### Example Code Style

```typescript
import { z } from 'zod';

// Use explicit types and Zod schemas
const SignalSchema = z.object({
  id: z.string().ulid(),
  source: z.enum(['jira', 'outlook']),
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()),
});

type Signal = z.infer<typeof SignalSchema>;

// Explicit return types on functions
function processSignal(raw: unknown): Signal {
  return SignalSchema.parse(raw);
}

// British English in comments
// Normalise the signal data before processing
```

---

## Testing Requirements

### Testing Pyramid

| Layer       | Tool                    | Coverage Target                |
| ----------- | ----------------------- | ------------------------------ |
| Unit        | Vitest                  | 80% of core logic              |
| Integration | Vitest + DynamoDB Local | All DB operations              |
| E2E         | Playwright              | Critical user flows            |
| LLM Quality | Golden scenarios        | 10+ scenarios, >= 90% accuracy |

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests for a specific package
pnpm --filter @agentic-pm/core test

# Run type checking
pnpm typecheck
```

### Test Requirements for Pull Requests

1. All existing tests must pass
2. New functionality must include unit tests
3. Database operations require integration tests
4. LLM interactions require golden scenario coverage
5. Type checking must pass without errors

---

## Pull Request Process

### Before Submitting

1. **Create a feature branch** from `main`

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style guidelines

3. **Write tests** for new functionality

4. **Run the full test suite**

   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```

5. **Update documentation** if your changes affect the API or user-facing
   features

### Submitting a Pull Request

1. Push your branch to the repository
2. Create a pull request with a clear title and description
3. Fill in the pull request template
4. Link any related issues
5. Request review from maintainers

### Pull Request Checklist

- [ ] Tests pass locally (`pnpm test`)
- [ ] Type checking passes (`pnpm typecheck`)
- [ ] Linting passes (`pnpm lint`)
- [ ] Documentation updated (if applicable)
- [ ] Commit messages follow the conventional format
- [ ] No secrets or credentials in the code
- [ ] Changes are backwards compatible (or breaking changes are documented)

### Review Process

1. At least one maintainer must approve the PR
2. All CI checks must pass
3. Any requested changes must be addressed
4. The PR will be merged using squash merge

---

## Commit Message Format

This project follows
[Conventional Commits](https://www.conventionalcommits.org/).

### Format

```
<type>(<scope>): <subject>

[optional body]

[optional footer(s)]
```

### Types

| Type       | Description                                             |
| ---------- | ------------------------------------------------------- |
| `feat`     | A new feature                                           |
| `fix`      | A bug fix                                               |
| `docs`     | Documentation only changes                              |
| `style`    | Code style changes (formatting, semicolons, etc.)       |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `perf`     | Performance improvement                                 |
| `test`     | Adding or updating tests                                |
| `build`    | Changes to build process or dependencies                |
| `ci`       | Changes to CI configuration                             |
| `chore`    | Other changes that do not modify src or test files      |

### Scopes

| Scope     | Description                      |
| --------- | -------------------------------- |
| `core`    | Changes to `@agentic-pm/core`    |
| `lambdas` | Changes to `@agentic-pm/lambdas` |
| `web`     | Changes to `@agentic-pm/web`     |
| `cdk`     | Changes to `@agentic-pm/cdk`     |
| `deps`    | Dependency updates               |
| `config`  | Configuration changes            |

### Examples

```
feat(core): add signal normalisation for Jira webhooks

fix(lambdas): handle timeout in triage-sanitise Lambda

docs: update README with local development instructions

test(core): add golden scenarios for artefact generation

refactor(web): extract activity feed into separate component

chore(deps): update @anthropic-ai/sdk to 0.32.1
```

### Guidelines

- Use the imperative mood ("add feature" not "added feature")
- Do not capitalise the first letter of the subject
- Do not end the subject with a period
- Keep the subject line under 72 characters
- Use the body to explain what and why, not how

---

## Questions?

If you have questions about contributing, please open an issue or reach out to
the maintainers.
