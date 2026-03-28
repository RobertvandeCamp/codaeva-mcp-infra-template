import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as amplify from '@aws-cdk/aws-amplify-alpha';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';

export interface ConsentStackProps extends cdk.StackProps {
  githubOwner: string;
  githubRepo: string;
  githubBranch?: string;
}

export class ConsentStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ConsentStackProps) {
    super(scope, id, props);

    const branch = props.githubBranch || 'main';

    // GitHub token from Secrets Manager (must exist before deploy)
    const githubToken = secretsmanager.Secret.fromSecretNameV2(
      this, 'GitHubToken', 'github-token',
    );

    const amplifyApp = new amplify.App(this, 'OAuthConsent', {
      appName: `{{PROJECT_NAME}}-oauth-consent`,
      description: `{{DISPLAY_NAME}} OAuth Consent App`,
      sourceCodeProvider: new amplify.GitHubSourceCodeProvider({
        owner: props.githubOwner,
        repository: props.githubRepo,
        oauthToken: githubToken.secretValue,
      }),
      buildSpec: codebuild.BuildSpec.fromObjectToYaml({
        version: '1.0',
        frontend: {
          phases: {
            preBuild: { commands: ['npm ci --prefer-offline --no-audit'] },
            build: { commands: ['npm run build'] },
          },
          artifacts: { baseDirectory: 'dist', files: ['**/*'] },
          cache: { paths: ['node_modules/**/*'] },
        },
      }),
      autoBranchDeletion: true,
      environmentVariables: {
        VITE_SUPABASE_URL: 'https://placeholder.supabase.co',
        VITE_SUPABASE_ANON_KEY: 'placeholder',
      },
    });

    amplifyApp.addBranch(branch, {
      branchName: branch,
      stage: 'PRODUCTION',
      autoBuild: true,
    });

    // SPA rewrite rules
    amplifyApp.addCustomRule({
      source: '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>',
      target: '/index.html',
      status: amplify.RedirectStatus.REWRITE,
    });

    amplifyApp.addCustomRule({
      source: '/<*>',
      target: '/index.html',
      status: amplify.RedirectStatus.NOT_FOUND_REWRITE,
    });

    // Outputs
    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: amplifyApp.appId,
      description: 'Amplify App ID',
    });

    new cdk.CfnOutput(this, 'AmplifyAppUrl', {
      value: `https://${branch}.${amplifyApp.defaultDomain}`,
      description: 'Amplify Application URL',
    });
  }
}
