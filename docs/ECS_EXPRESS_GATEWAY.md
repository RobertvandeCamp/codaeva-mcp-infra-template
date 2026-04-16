# ECS Express Gateway — Sharing Model

How `AWS::ECS::ExpressGatewayService` shares infrastructure across services, and when you get a separate gateway.

## TL;DR

- You do **not** declare the gateway. You only declare services (`CfnExpressGatewayService`).
- AWS auto-provisions **one gateway ALB per (account, region, ECS cluster, VPC)**.
- All services in the same cluster+VPC share that ALB, listener, TLS cert, and public IPs.
- To get a separate gateway, change one of: account, region, cluster, or VPC.

## What the "Gateway" actually is

The ECS Express Gateway is AWS-managed infrastructure that sits in front of every `CfnExpressGatewayService` resource. It consists of:

- An internet-facing Application Load Balancer (`ecs-express-gateway-alb-<hash>`)
- HTTPS listener on port 443 with automatic wildcard cert discovery
- Low-priority listener rules that route per-service traffic (by Host header / path)
- Per-service target groups (`ecs-gateway-tg-<hash>`)
- Public endpoint per service: `<service-hash>.ecs.<region>.on.aws`

None of these are declarable in CloudFormation — only `AWS::ECS::ExpressGatewayService` is a public resource type. Run this to confirm in your account:

```bash
aws cloudformation list-types --visibility PUBLIC \
  --filters TypeNamePrefix=AWS::ECS::Express \
  --region <region>
```

## How sharing works

When you deploy a `CfnExpressGatewayService`, CloudFormation:

1. Looks up the ECS cluster (from `cluster` prop, or `default` if omitted).
2. Looks at the VPC (from `networkConfiguration.awsVpcConfiguration.subnets`, or default VPC).
3. Checks if a gateway already exists for that cluster+VPC combination.
4. **If yes** → registers your service with it: creates a target group, adds a listener rule.
5. **If no** → provisions a new gateway ALB, then registers your service.

The **first** service deployed in a (cluster, VPC) combo creates the ALB. Every service deployed afterward shares it.

## Sharing boundaries

| Axis | Shared? | How to split |
|---|---|---|
| AWS account | hard boundary | New AWS account |
| AWS region | hard boundary | Deploy to a different region |
| **ECS cluster** | hard boundary | `aws ecs create-cluster` + pass `cluster` prop |
| **VPC** (via subnets) | hard boundary | Use different subnets in `networkConfiguration` |

## When to share vs. split

### Share (default)

- Related services from the same product family
- Same team / same compliance scope
- You want minimal cost (one ALB: ~$16-22/month + LCU)

### Split (separate cluster or VPC)

- Completely unrelated products on the same AWS account
- Different compliance or isolation requirements
- Different SLA targets (e.g., one critical, one experimental)
- Blast-radius concerns (a bad listener rule on the shared ALB affects everyone)

Each additional gateway = one additional ALB. Budget accordingly.

## Recipes

### Share (default behavior)

```typescript
new ecs.CfnExpressGatewayService(this, "MyService", {
  serviceName: "my-service",
  executionRoleArn: ...,
  infrastructureRoleArn: ...,
  primaryContainer: { image, containerPort, environment, secrets },
  scalingTarget: { minTaskCount: 1, maxTaskCount: 2, ... },
});
```

No `cluster` or `networkConfiguration` → uses `default` cluster + default VPC → joins whatever shared gateway already exists (or creates one).

### Separate cluster (simplest isolation)

```bash
aws ecs create-cluster --cluster-name my-other-usecase \
  --region <region>
```

Then:

```typescript
new ecs.CfnExpressGatewayService(this, "MyService", {
  cluster: "my-other-usecase",   // new dedicated cluster
  serviceName: "my-service",
  // ... rest unchanged
});
```

First service in this cluster creates `ecs-express-gateway-alb-<new-hash>`.

### Separate VPC (strongest isolation in same account)

```typescript
new ecs.CfnExpressGatewayService(this, "MyService", {
  serviceName: "my-service",
  networkConfiguration: {
    awsVpcConfiguration: {
      subnets: ["subnet-aaa", "subnet-bbb", "subnet-ccc"],  // from the other VPC
      securityGroups: ["sg-xxx"],
    },
  },
  // ...
});
```

## What resources you can safely share in the same gateway

| Resource | Sharing pattern |
|---|---|
| ALB + HTTPS listener + TLS cert | Automatic (via the gateway) |
| ECS cluster | Automatic within a cluster |
| VPC, subnets, security groups | Automatic within a VPC |
| NAT Gateway | Shared across all services in the VPC (significant cost saver: ~$32/month per NAT AZ) |
| VPC endpoints (ECR, Secrets Manager, CloudWatch Logs) | Declare once, used by all services |
| ACM wildcard cert | Automatically attached to the gateway listener |
| Route53 hosted zone | Shared; one alias record per service hostname |
| Secrets Manager KMS key | Reuse one CMK across `*/env` secrets |

## What to keep per service

| Resource | Why |
|---|---|
| ECR repository | Per-service image lifecycle and access control; cost is negligible |
| Secrets Manager secrets | Per-service `*/env` limits blast radius |
| Task role (app runtime permissions) | Services need different DB schemas, queues, etc. |
| Infrastructure role | Scoped to the service ARN |

## Inspecting your gateway

### What services share the gateway?

```bash
aws ecs list-services --cluster default --region <region>
aws ecs list-services --cluster my-other-usecase --region <region>
```

Services in the same cluster + same VPC share the same gateway.

### Which ALB is the gateway?

```bash
aws elbv2 describe-load-balancers \
  --query 'LoadBalancers[?starts_with(LoadBalancerName, `ecs-express-gateway-alb-`)].{Name: LoadBalancerName, DNS: DNSName, VpcId: VpcId}' \
  --region <region>
```

### What's the per-service public endpoint?

```bash
aws ecs describe-express-gateway-service \
  --service <service-arn> \
  --region <region> \
  --query 'service.activeConfigurations[0].ingressPaths[0].endpoint'
```

Returns something like `sb-<hash>.ecs.<region>.on.aws`.

## Known limitations

- You cannot move a service between gateways (i.e., between clusters) without delete + recreate.
- You cannot pre-provision a gateway without deploying at least one service into it.
- Listener rule priorities are auto-assigned at low numbers (1, 3, ...). Custom host-header rules you add manually should use higher priorities (10+) to avoid collision with ECS-managed rules.
- The gateway ALB name (`ecs-express-gateway-alb-<hash>`) is not stable across re-creation — treat it as opaque.

## References

- AWS resource type: [`AWS::ECS::ExpressGatewayService`](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-resource-ecs-expressgatewayservice.html)
- AWS CLI: `aws ecs create-express-gateway-service --help`
- Managed IAM policy: `AmazonECSInfrastructureRoleforExpressGatewayServices`
