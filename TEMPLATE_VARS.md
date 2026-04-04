# Template Variables

All template variables use the `{{VAR}}` format. Replace them before deploying.

## Variables

| Variable | Description | Example | Used in |
|----------|-------------|---------|---------|
| `{{PROJECT_NAME}}` | Project name (kebab-case) | `cashflow-buddy` | CDK stack names, ECR repos, Amplify app |
| `{{DISPLAY_NAME}}` | Display name (human-readable) | `Cashflow Buddy` | CDK descriptions, docs, SQL comments |
| `{{SUPABASE_SCHEMA}}` | Database schema name (snake_case) | `cashflow_buddy` | Migrations, config.toml |
| `{{ROLES}}` | Roles as SQL enum values | `'admin', 'viewer'` | 001 migration (app_role enum) |
| `{{SECRETS_PREFIX}}` | Secrets Manager prefix | `cashflow-buddy` | SharedStack, SETUP.md |
| `{{GITHUB_OWNER}}` | GitHub organisation/user | `RobertvandeCamp` | ConsentStack, ADD_MCP_SERVER.md |
| `{{AWS_REGION}}` | AWS region | `eu-central-1` | CDK stacks, .env |
| `{{AWS_ACCOUNT_ID}}` | AWS Account ID for IAM role conditions | `123456789012` | McpServerStack (infra role source conditions) |

## Replacement Command

Set your values and run from the repo root:

```bash
PROJECT_NAME="your-project"
DISPLAY_NAME="Your Project"
SUPABASE_SCHEMA="your_project"
ROLES="'admin', 'viewer'"
SECRETS_PREFIX="your-project"
GITHUB_OWNER="YourGitHub"
AWS_REGION="eu-central-1"
AWS_ACCOUNT_ID="123456789012"

find . -type f \( -name "*.ts" -o -name "*.json" -o -name "*.md" -o -name "*.sql" -o -name "*.toml" -o -name "*.example" \) \
  -not -path "*/node_modules/*" -not -path "*/.git/*" \
  -exec sed -i '' \
    -e "s/{{PROJECT_NAME}}/$PROJECT_NAME/g" \
    -e "s/{{DISPLAY_NAME}}/$DISPLAY_NAME/g" \
    -e "s/{{SUPABASE_SCHEMA}}/$SUPABASE_SCHEMA/g" \
    -e "s/{{ROLES}}/$ROLES/g" \
    -e "s/{{SECRETS_PREFIX}}/$SECRETS_PREFIX/g" \
    -e "s/{{GITHUB_OWNER}}/$GITHUB_OWNER/g" \
    -e "s/{{AWS_REGION}}/$AWS_REGION/g" \
    -e "s/{{AWS_ACCOUNT_ID}}/$AWS_ACCOUNT_ID/g" \
    {} +
```

> **Note:** On Linux, use `sed -i` instead of `sed -i ''`.

## After Replacement

1. Verify no remaining `{{` patterns: `grep -r '{{' --include="*.ts" --include="*.sql" --include="*.toml" --include="*.md" .`
2. Continue with the [setup guide](docs/SETUP.md)
