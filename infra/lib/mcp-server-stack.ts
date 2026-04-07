import * as cdk from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { SharedStackOutputs } from './shared-stack';

export interface McpServerStackProps extends cdk.StackProps {
  serverName: string;
  ecrRepoName: string;
  sharedOutputs: SharedStackOutputs;
  awsAccountId: string;
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

    // IAM: Task Execution Role (ECR pull + CloudWatch Logs + Secrets Manager read)
    const executionRole = new iam.Role(this, 'TaskExecutionRole', {
      roleName: `${props.serverName}-execution-role`,
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy',
        ),
      ],
    });

    executionRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [supabaseServiceKey.secretArn],
      }),
    );

    // IAM: Infrastructure Role (ALB, security groups, target groups, scaling)
    const infrastructureRole = new iam.Role(this, 'InfrastructureRole', {
      roleName: `${props.serverName}-infra-role`,
      assumedBy: new iam.ServicePrincipal('ecs.amazonaws.com', {
        conditions: {
          StringEquals: {
            'aws:SourceAccount': props.awsAccountId,
          },
          ArnLike: {
            'aws:SourceArn': `arn:aws:ecs:${cdk.Aws.REGION}:${props.awsAccountId}:*`,
          },
        },
      }),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSInfrastructureRoleforExpressGatewayServices',
        ),
      ],
    });

    // Non-sensitive environment variables
    const environment: ecs.CfnExpressGatewayService.KeyValuePairProperty[] = [
      { name: 'NODE_ENV', value: 'production' },
      { name: 'LOG_LEVEL', value: 'info' },
    ];

    // Secrets from Secrets Manager
    const secrets: ecs.CfnExpressGatewayService.SecretProperty[] = [
      {
        name: 'SUPABASE_SERVICE_KEY',
        valueFrom: `${supabaseServiceKey.secretArn}:SUPABASE_SERVICE_KEY::`,
      },
    ];

    // ECS Express Gateway Service
    const service = new ecs.CfnExpressGatewayService(this, 'McpService', {
      serviceName: props.serverName,
      executionRoleArn: executionRole.roleArn,
      infrastructureRoleArn: infrastructureRole.roleArn,
      cpu: '1024',
      memory: '2048',
      healthCheckPath: '/health',
      primaryContainer: {
        image: `${ecrRepository.repositoryUri}:latest`,
        containerPort: 3000,
        environment,
        secrets,
      },
      scalingTarget: {
        minTaskCount: 1,
        maxTaskCount: 3,
        autoScalingMetric: 'AVERAGE_CPU',
        autoScalingTargetValue: 60,
      },
    });

    // Outputs
    new cdk.CfnOutput(this, 'ServiceUrl', {
      value: `https://${service.attrEndpoint}`,
      description: `${props.serverName} URL`,
    });

    new cdk.CfnOutput(this, 'EcrRepositoryUri', {
      value: ecrRepository.repositoryUri,
      description: 'ECR repository URI for Docker images',
    });

    new cdk.CfnOutput(this, 'HealthCheckUrl', {
      value: `https://${service.attrEndpoint}/health`,
      description: 'Health check endpoint',
    });

    new cdk.CfnOutput(this, 'ServiceArn', {
      value: service.attrServiceArn,
      description: 'ECS Express service ARN for deployments',
    });

    new cdk.CfnOutput(this, 'LoadBalancerArn', {
      value: service.attrEcsManagedResourceArnsIngressPathLoadBalancerArn,
      description: 'ALB ARN for idle timeout tuning (set to 120s post-deploy)',
    });

    new cdk.CfnOutput(this, 'TaskExecutionRoleArn', {
      value: executionRole.roleArn,
      description: 'Task execution role ARN for ECS Express deploy action',
    });

    new cdk.CfnOutput(this, 'InfrastructureRoleArn', {
      value: infrastructureRole.roleArn,
      description: 'Infrastructure role ARN for ECS Express deploy action',
    });
  }
}
