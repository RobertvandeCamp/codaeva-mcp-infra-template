#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SharedStack } from '../lib/shared-stack';
import { McpServerStack } from '../lib/mcp-server-stack';
import { ConsentStack } from '../lib/consent-stack';

const app = new cdk.App();

const projectName = '{{PROJECT_NAME}}';
const githubOwner = '{{GITHUB_OWNER}}';

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: '{{AWS_REGION}}',
};

// Shared resources (Secrets Manager)
const shared = new SharedStack(app, `${projectName}-shared`, {
  env,
  description: `{{DISPLAY_NAME}} - Shared Infrastructure`,
});

// OAuth Consent App (Amplify hosting)
new ConsentStack(app, `${projectName}-consent`, {
  env,
  description: `{{DISPLAY_NAME}} - OAuth Consent App`,
  githubOwner,
  githubRepo: `${projectName}-oauth-consent`,
});

// Primary MCP Server (AppRunner + ECR)
new McpServerStack(app, `${projectName}-mcp-server`, {
  env,
  description: `{{DISPLAY_NAME}} - MCP Server`,
  serverName: `${projectName}-mcp-server`,
  ecrRepoName: `${projectName}-mcp-server`,
  sharedOutputs: shared.outputs,
  supabaseUrl: 'https://placeholder.supabase.co',
  supabaseAnonKey: 'placeholder',
});

// To add another MCP server, uncomment and customize:
// new McpServerStack(app, `${projectName}-supplier-mcp`, {
//   env,
//   description: `{{DISPLAY_NAME}} - Supplier MCP Server`,
//   serverName: `${projectName}-supplier-mcp`,
//   ecrRepoName: `${projectName}-supplier-mcp`,
//   sharedOutputs: shared.outputs,
//   supabaseUrl: 'https://placeholder.supabase.co',
//   supabaseAnonKey: 'placeholder',
// });
