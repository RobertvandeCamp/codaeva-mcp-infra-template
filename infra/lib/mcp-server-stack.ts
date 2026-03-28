import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apprunner from '@aws-cdk/aws-apprunner-alpha';
import { Construct } from 'constructs';
import { SharedStackOutputs } from './shared-stack';

export interface McpServerStackProps extends cdk.StackProps {
  serverName: string;
  ecrRepoName: string;
  sharedOutputs: SharedStackOutputs;
  supabaseUrl: string;
  supabaseAnonKey: string;
  mcpResourceIdentifier?: string;
}

export class McpServerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: McpServerStackProps) {
    super(scope, id, props);

    // ECR repository (created manually or via separate process)
    const ecrRepository = ecr.Repository.fromRepositoryName(
      this, 'McpServerRepository', props.ecrRepoName,
    );

    // Reference shared secret
    const supabaseServiceKey = secretsmanager.Secret.fromSecretNameV2(
      this, 'SupabaseServiceKey', props.sharedOutputs.supabaseServiceKeyName,
    );

    // IAM: Access role (ECR pull)
    const appRunnerAccessRole = new iam.Role(this, 'AppRunnerAccessRole', {
      assumedBy: new iam.ServicePrincipal('build.apprunner.amazonaws.com'),
      description: `Access role for ${props.serverName} App Runner to pull ECR images`,
    });
    ecrRepository.grantPull(appRunnerAccessRole);

    // IAM: Instance role (Secrets Manager read)
    const appRunnerInstanceRole = new iam.Role(this, 'AppRunnerInstanceRole', {
      assumedBy: new iam.ServicePrincipal('tasks.apprunner.amazonaws.com'),
      description: `Instance role for ${props.serverName} with Secrets Manager read`,
    });
    supabaseServiceKey.grantRead(appRunnerInstanceRole);

    // MCP Resource Identifier
    const mcpResourceIdentifier = props.mcpResourceIdentifier || `https://${props.serverName}.example.com`;

    // App Runner Service
    const service = new apprunner.Service(this, 'McpServerService', {
      serviceName: props.serverName,
      source: apprunner.Source.fromEcr({
        repository: ecrRepository,
        tagOrDigest: 'latest',
        imageConfiguration: {
          port: 3000,
          environmentVariables: {
            NODE_ENV: 'production',
            LOG_LEVEL: 'info',
            SUPABASE_URL: props.supabaseUrl,
            SUPABASE_ANON_KEY: props.supabaseAnonKey,
            MCP_RESOURCE_IDENTIFIER: mcpResourceIdentifier,
          },
          environmentSecrets: {
            SUPABASE_SERVICE_KEY: apprunner.Secret.fromSecretsManager(supabaseServiceKey),
          },
        },
      }),
      accessRole: appRunnerAccessRole,
      instanceRole: appRunnerInstanceRole,
      autoDeploymentsEnabled: true,
      healthCheck: apprunner.HealthCheck.http({
        path: '/health',
        interval: cdk.Duration.seconds(10),
        timeout: cdk.Duration.seconds(5),
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      }),
    });

    // Outputs
    new cdk.CfnOutput(this, 'AppRunnerServiceUrl', {
      value: `https://${service.serviceUrl}`,
      description: `${props.serverName} URL`,
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: ecrRepository.repositoryUri,
      description: 'ECR repository URI for Docker images',
    });

    new cdk.CfnOutput(this, 'HealthCheckUrl', {
      value: `https://${service.serviceUrl}/health`,
      description: 'Health check endpoint',
    });
  }
}
