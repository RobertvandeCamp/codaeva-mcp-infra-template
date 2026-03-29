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
- **McpServerStack**: App Runner service + ECR repository + IAM roles
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

## Post-deploy Checklist

- [ ] Create ECR repository: `aws ecr create-repository --repository-name {{PROJECT_NAME}}-mcp-server`
- [ ] Build and push Docker image to ECR (see MCP server repo README)
- [ ] Set App Runner environment variables in AWS Console (SUPABASE_URL, SUPABASE_ANON_KEY)
- [ ] Set Amplify environment variables in AWS Console (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- [ ] Verify App Runner service is running: check the `AppRunnerServiceUrl` output
- [ ] Verify Amplify app is deployed: check the `AmplifyAppUrl` output
- [ ] Create first admin user in Supabase Auth and set `is_admin = true` in `user_profiles`
