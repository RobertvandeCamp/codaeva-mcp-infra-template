# {{DISPLAY_NAME}} - Setup Guide

First-time setup for deploying the infrastructure and database.

## Prerequisites

- **AWS CLI** configured with credentials (`aws sts get-caller-identity`)
- **Node.js 18+** with npm
- **Supabase CLI** installed (`brew install supabase/tap/supabase`)
- **GitHub CLI** installed (`brew install gh`)

## Step 1: Replace Template Variables

Before anything else, replace all template variables with your project values. See [TEMPLATE_VARS.md](../TEMPLATE_VARS.md) for the full list and the `sed` replacement command.

## Step 2: Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note the following from your project settings:
   - **Project URL** (e.g., `https://abcdefgh.supabase.co`)
   - **Anon key** (public, safe for frontend)
   - **Service role key** (secret, backend only)
   - **Project ref** (the `abcdefgh` part of the URL)

## Step 3: Fill in .env

```bash
cp .env.example .env
```

Fill in the values from Step 2:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key
```

## Step 4: Database Migrations

Link your local Supabase CLI to the remote project and push migrations:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

This creates:
- The `{{SUPABASE_SCHEMA}}` schema
- `user_profiles` table with auto-create trigger
- `app_role` enum with configured roles
- RLS policies (own profile, admin access, service role)
- `custom_access_token_hook` function

## Step 5: Store GitHub Token in Secrets Manager

Amplify needs a GitHub Personal Access Token to pull from private repos. Store it in Secrets Manager **before** CDK deploy:

```bash
aws secretsmanager create-secret \
  --name github-token \
  --secret-string "ghp_your_github_pat"
```

The token needs `repo` scope for private repositories.

## Step 6: CDK Bootstrap & Deploy

```bash
cd infra
npm install
npx cdk bootstrap
npx cdk deploy --all
```

This deploys:
- **SharedStack**: Secrets Manager entry for Supabase service key
- **McpServerStack**: ECS Express service + ECR repository + IAM roles (task execution + infrastructure)
- **ConsentStack**: Amplify hosting for OAuth consent app

## Step 7: Populate Supabase Service Key

CDK deploy (Step 6) creates the Secrets Manager entry with a placeholder value. Now update it with the real Supabase service role key:

```bash
aws secretsmanager put-secret-value \
  --secret-id {{SECRETS_PREFIX}}/supabase-service-key \
  --secret-string "<your-service-role-key>"
```

## Step 8: Activate Supabase Auth Hook

The `custom_access_token_hook` must be enabled manually in the Supabase dashboard:

1. Go to **Dashboard > Authentication > Hooks**
2. Find **Custom Access Token** and enable it
3. Select the function: `{{SUPABASE_SCHEMA}}.custom_access_token_hook`
4. Save

This injects `role` and `is_admin` claims into every JWT token.

## Important: Deploy Order

ECS Express requires resources to exist **before** CDK deploy. The correct order is:

1. ECR repository (must exist for CDK to reference)
2. Docker image pushed to ECR (ECS Express fails with "No rollback candidate" if the repo is empty)
3. Secrets Manager entries populated with real values
4. ECS cluster created (if using a dedicated cluster)
5. CDK deploy
6. ALB idle timeout tuning (post-deploy)

Skipping steps 2 or 4 causes cryptic CloudFormation errors that are hard to debug.

### Step A: Create ECR Repository

```bash
aws ecr create-repository --repository-name {{PROJECT_NAME}}-mcp-server --region {{AWS_REGION}}
```

### Step B: Build and Push Docker Image

The ECR repo must contain at least one image before CDK deploy. ECS Express tries to start a container immediately; an empty repo causes "No rollback candidate was found to run the rollback."

```bash
# Login to ECR
aws ecr get-login-password --region {{AWS_REGION}} | \
  docker login --username AWS --password-stdin <account-id>.dkr.ecr.{{AWS_REGION}}.amazonaws.com

# Build and push (use --platform linux/amd64 on Apple Silicon)
docker buildx build --platform linux/amd64 -f docker/Dockerfile \
  -t <account-id>.dkr.ecr.{{AWS_REGION}}.amazonaws.com/{{PROJECT_NAME}}-mcp-server:latest \
  --push .
```

### Step C: Create ECS Cluster (optional)

By default, services go into the `default` ECS cluster. To isolate projects:

```bash
aws ecs create-cluster --cluster-name {{PROJECT_NAME}} --region {{AWS_REGION}}
```

Then add `clusterName: '{{PROJECT_NAME}}'` to the McpServerStack props in `bin/app.ts`. See [ECS_EXPRESS_GATEWAY.md](./ECS_EXPRESS_GATEWAY.md) for sharing vs. splitting decisions.

### Step D: CDK Deploy

Now safe to deploy:

```bash
cd infra
npm install
npx cdk bootstrap  # first time only
npx cdk deploy --all
```

## Post-deploy Checklist

- [ ] Store Supabase URL and anon key in Secrets Manager or update CDK stack environment variables
- [ ] Set Amplify environment variables in AWS Console (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- [ ] Verify ECS Express service is running: check the `ServiceUrl` output
- [ ] Tune ALB idle timeout to 120s for MCP SSE streaming: `aws elbv2 modify-load-balancer-attributes --load-balancer-arn <LoadBalancerArn> --attributes Key=idle_timeout.timeout_seconds,Value=120`
- [ ] Verify Amplify app is deployed: check the `AmplifyAppUrl` output
- [ ] Create first admin user in Supabase Auth and set `is_admin = true` in `user_profiles`
- [ ] Configure GitHub Secrets for CI/CD (see GitHub Actions section below)

## IAM User for CI/CD

Create a dedicated IAM user for CDK deploys and CI/CD pipelines. The user needs permissions for ECS Express, ECR, CloudFormation, Secrets Manager, EC2 networking, ALB, CloudWatch Logs, and auto-scaling.

**Key permission notes:**
- `logs:*` on `*` is required -- ECS Express creates log groups with its own naming scheme (e.g., `/aws/ecs/<cluster>/<service>-<hash>`)
- `ecs:*` is needed for `CfnExpressGatewayService` (not covered by standard ECS policies)
- `sts:AssumeRole` on `cdk-*` roles is needed for CDK deploys through CloudFormation

```bash
# Create user
aws iam create-user --user-name {{PROJECT_NAME}}-ecs-user

# Create and attach policy (see bratra-ecs-deploy-policy for a working example)
aws iam create-access-key --user-name {{PROJECT_NAME}}-ecs-user
```

## Secrets Manager: Use Full ARNs

When referencing secrets in CDK, always use `fromSecretCompleteArn` with the **full ARN** (including the random 6-character suffix). Using `fromSecretNameV2` generates a partial ARN that won't match in IAM policies, causing "AccessDeniedException" at container startup.

```typescript
// CORRECT: full ARN with random suffix
const secret = secretsmanager.Secret.fromSecretCompleteArn(
  this, 'MySecret', 'arn:aws:secretsmanager:eu-central-1:123456789:secret:my-secret-aBcDeF',
);

// WRONG: partial ARN, IAM policy won't match
const secret = secretsmanager.Secret.fromSecretNameV2(
  this, 'MySecret', 'my-secret',
);
```

Get the full ARN after creating a secret:
```bash
aws secretsmanager describe-secret --secret-id my-secret --query ARN --output text
```
