# Adding an MCP Server

How to add an additional MCP server to your infrastructure.

## What You Need

- **Server name** in kebab-case (e.g., `supplier-mcp-server`)
- **ECR repo name** (typically same as server name)

## Step 1: Add McpServerStack in bin/app.ts

Open `infra/bin/app.ts`. There is a commented-out example for a second MCP server. Uncomment and customize it:

```typescript
new McpServerStack(app, `${projectName}-supplier-mcp`, {
  env,
  description: `{{DISPLAY_NAME}} - Supplier MCP Server`,
  serverName: `${projectName}-supplier-mcp`,
  ecrRepoName: `${projectName}-supplier-mcp`,
  sharedOutputs: shared.outputs,
  awsAccountId: '{{AWS_ACCOUNT_ID}}',
});
```

Each `McpServerStack` creates its own:
- ECS Express service (with managed ALB)
- Task execution role (ECR pull + Secrets Manager read)
- Infrastructure role (ALB/SG management)

All servers share the same Secrets Manager entry from SharedStack.

## Step 2: Create ECR Repository

```bash
aws ecr create-repository --repository-name {{PROJECT_NAME}}-supplier-mcp
```

## Step 3: CDK Deploy

```bash
cd infra
npx cdk deploy {{PROJECT_NAME}}-supplier-mcp
```

Or deploy all stacks at once:

```bash
npx cdk deploy --all
```

## Step 4: Create MCP Server Repo

Create a new repository from the `codaeva-mcp-server-template`:

1. Go to [codaeva-mcp-server-template](https://github.com/{{GITHUB_OWNER}}/codaeva-mcp-server-template) on GitHub
2. Click **Use this template** > **Create a new repository**
3. Name it `{{PROJECT_NAME}}-supplier-mcp` (matching the ECR repo name)
4. Follow the server template's README for setup

## Naming Convention

Keep names consistent across all resources:

| Resource | Name |
|----------|------|
| CDK stack ID | `${projectName}-supplier-mcp` |
| ECS Express service | `${projectName}-supplier-mcp` |
| ECR repository | `${projectName}-supplier-mcp` |
| GitHub repo | `${projectName}-supplier-mcp` |
