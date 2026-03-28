import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface SharedStackOutputs {
  supabaseServiceKeyArn: string;
  supabaseServiceKeyName: string;
}

export class SharedStack extends cdk.Stack {
  public readonly outputs: SharedStackOutputs;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Secrets Manager entry for Supabase service role key
    // Must be populated manually after Supabase project creation
    const supabaseServiceKey = new secretsmanager.Secret(this, 'SupabaseServiceKey', {
      secretName: `{{SECRETS_PREFIX}}/supabase-service-key`,
      description: `Supabase service role key for {{DISPLAY_NAME}}`,
    });

    this.outputs = {
      supabaseServiceKeyArn: supabaseServiceKey.secretArn,
      supabaseServiceKeyName: supabaseServiceKey.secretName,
    };

    // Outputs
    new cdk.CfnOutput(this, 'SupabaseServiceKeyArn', {
      value: supabaseServiceKey.secretArn,
      description: 'ARN of Supabase service key secret',
    });

    new cdk.CfnOutput(this, 'SupabaseServiceKeyName', {
      value: supabaseServiceKey.secretName,
      description: 'Name of Supabase service key secret',
    });
  }
}
