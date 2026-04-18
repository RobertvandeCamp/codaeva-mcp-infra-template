# {{DISPLAY_NAME}} - Architecture

Infrastructure overview for the MCP project.

## Overview

```
                        ┌─────────────────────┐
                        │     SharedStack      │
                        │  (Secrets Manager)   │
                        └──────────┬──────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
           ┌────────▼───────┐ ┌───▼────────┐ ┌──▼──────────────┐
           │ McpServerStack │ │ McpServer  │ │  ConsentStack   │
           │   (primary)    │ │ Stack (2+) │ │   (Amplify)     │
           │ ECS Express+ECR│ │ (optional) │ │ OAuth Consent   │
           └────────────────┘ └────────────┘ └─────────────────┘
```

## Stacks

### SharedStack

Shared resources used by all other stacks.

| Resource | Type | Purpose |
|----------|------|---------|
| Supabase service key | Secrets Manager | Service role key for backend access |

**Outputs:** `SupabaseServiceKeyArn`, `SupabaseServiceKeyName`

### McpServerStack (reusable)

One instance per MCP server. Can be instantiated multiple times in `bin/app.ts`.

| Resource | Type | Purpose |
|----------|------|---------|
| ECS Express service | `CfnExpressGatewayService` (aws-cdk-lib/aws-ecs) | Runs MCP server container with managed ALB |
| ECR repository | `aws-cdk-lib/aws-ecr` | Docker image storage (referenced, created externally) |
| Task execution role | IAM Role | Allows ECS to pull ECR images and read Secrets Manager |
| Infrastructure role | IAM Role | Allows ECS to manage ALB, security groups, target groups |

**Props:** `serverName`, `ecrRepoName`, `sharedOutputs`, `awsAccountId`, `clusterName?`

When `clusterName` is provided, the service is placed in a dedicated ECS cluster (must exist before deploy). Without it, services use the `default` cluster. Use dedicated clusters to isolate projects -- see [ECS_EXPRESS_GATEWAY.md](./ECS_EXPRESS_GATEWAY.md).

**Secrets:** Use `fromSecretCompleteArn` with full ARNs (including random suffix). `fromSecretNameV2` generates partial ARNs that fail IAM policy matching at container startup. See [SETUP.md](./SETUP.md#secrets-manager-use-full-arns).

**Outputs:** `ServiceUrl`, `EcrRepositoryUri`, `HealthCheckUrl`, `ServiceArn`, `LoadBalancerArn`, `TaskExecutionRoleArn`, `InfrastructureRoleArn`

### ConsentStack

OAuth consent app hosted on AWS Amplify.

| Resource | Type | Purpose |
|----------|------|---------|
| Amplify app | `@aws-cdk/aws-amplify-alpha` | Static site hosting with CI/CD |
| GitHub source | Amplify Source Code Provider | Auto-deploy from GitHub |
| SPA rewrites | Custom Rules | Client-side routing support |

**Props:** `githubOwner`, `githubRepo`, `githubBranch` (optional, default: `main`)

**Outputs:** `AmplifyAppId`, `AmplifyAppUrl`

## Database

### Schema: `{{SUPABASE_SCHEMA}}`

**user_profiles** - Central user table (1:1 with `auth.users`)

| Column | Type | Description |
|--------|------|-------------|
| id | UUID (PK) | References auth.users(id) |
| email | TEXT | User email |
| full_name | TEXT | Display name |
| role | app_role | User role (from enum) |
| is_admin | BOOLEAN | Admin flag |
| is_active | BOOLEAN | Active/deactivated |
| created_at | TIMESTAMPTZ | Created timestamp |
| updated_at | TIMESTAMPTZ | Last update timestamp |

**app_role** enum: configurable via `{{ROLES}}` template variable (default: `'admin', 'viewer'`).

### Custom Access Token Hook

The `custom_access_token_hook` function runs on every token refresh and injects:
- `role` - user's role from `user_profiles`
- `is_admin` - admin flag from `user_profiles`

Inactive users receive `role: 'viewer'` and `is_admin: false` regardless of their stored values.

### Row Level Security

| Policy | Table | Rule |
|--------|-------|------|
| Users can view own profile | user_profiles | `id = auth.uid() OR is_admin()` |
| Users can update own profile | user_profiles | `id = auth.uid()` |
| Service role full access | user_profiles | `true` |

Helper functions:
- `get_my_role()` - Returns current user's role from JWT
- `is_admin()` - Returns admin status from JWT

## Security

### IAM Roles

- **TaskExecutionRole**: Assumed by `ecs-tasks.amazonaws.com`, grants ECR pull (via AmazonECSTaskExecutionRolePolicy) + Secrets Manager read
- **InfrastructureRole**: Assumed by `ecs.amazonaws.com` (with SourceAccount/SourceArn conditions), grants ALB/SG management (via AmazonECSInfrastructureRoleforExpressGatewayServices)

### RLS Policies

All data access goes through Supabase RLS. The MCP server authenticates with user JWTs (not service_role), so RLS is enforced per user.

### JWT Claims

Custom claims injected by the access token hook enable client-side and server-side role checks without additional database queries.

## Template Variables

See [TEMPLATE_VARS.md](../TEMPLATE_VARS.md) for the full list of template variables and replacement instructions.
