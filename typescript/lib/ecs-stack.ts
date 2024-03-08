import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elb2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns"; 
// import * as route53 from "aws-cdk-lib/aws-route53";
// import * as route53targets from "aws-cdk-lib/aws-route53-targets";
// import * as cm from "aws-cdk-lib/aws-certificatemanager";

interface EcsStackProps extends cdk.StackProps {
  clientName: string;
  envName: string;
  domain: string;
  region: string;
}

export class EscStack extends cdk.Stack {

  public readonly vpc: ec2.IVpc;
  public readonly ecs: ecs.ICluster;
  public readonly clientName: string;
  public readonly envName: string;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);
       
    const clientName = props.clientName;
    const clientPrefix = `${clientName}-${props.envName}`;
    const hosted = `${props.envName}.${clientName}.${props.domain}`;
   
    //vpc resurces
    //TODO: do a lookup and see if that vpc exists
    //if not, create the dev or prod vpc
    const vpc = new ec2.Vpc(this, `${clientPrefix}-vpc`, {
      maxAzs: 2,      
      vpcName: `${clientPrefix}-vpc`,      
      ipAddresses: ec2.IpAddresses.cidr("10.13.0.0/16"),    
      enableDnsHostnames: true,  
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          name: `${clientPrefix}-private-subnet`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,  
        },
        {
          name: `${clientPrefix}-public-subnet`,                    
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
      ],      
    });    

    //add secret to get container later from private registry
    //cdk deploy --parameters appdmApiKey=12345 --profile sandbox EcsStacks
    const appdmApiKeyName = new cdk.CfnParameter(this, 'appdmApiKey', {
      type: 'String',
      description: 'AppDm Docker Hub Key',
      noEcho: true //do not show in cf template
    });
    
    const apiKeySecret = new secrets.Secret(this, 'AppDm-Docker-API-Key', {
      secretName: 'appdmApiKey',      
      secretStringValue:  cdk.SecretValue.unsafePlainText(
        appdmApiKeyName.valueAsString      
      ),
    });
    
    // const zone = new route53.PrivateHostedZone(this, `${clientPrefix}-zone`, {
    //   vpc: vpc,      
    //   zoneName: hosted,      
    //   comment: `${props.envName} sample web domain`
    // });

    
    // new route53.ARecord(this, `${clientPrefix}-domain`, {
    //   recordName: `${hosted}`,
    //   target: route53.RecordTarget.fromAlias(
    //     new route53targets.LoadBalancerTarget(elb)
    //   ),
    //   ttl: cdk.Duration.seconds(300),
    //   comment: `${props.envName} sample web domain`,
    //   region: `${props.region}`,
    //   zone: zone,
    // });

    // const cert = new cm.Certificate(
    //   this,
    //   `${clientPrefix}-cert`,
    //   {
    //     domainName: `${hosted}`,
    //     subjectAlternativeNames: [`*.${hosted}`],
    //     validation: cm.CertificateValidation.fromDns(zone),
    //   });
        
    const cluster  = new ecs.Cluster(this, `${clientPrefix}-ecs-cluster`, {
      vpc: vpc,
      clusterName: `${clientPrefix}-ecs-cluster`,    
    });     

       // the role assumed by the task and its containers
  const taskRole = new iam.Role(this, `${clientPrefix}-task-role`, {
    assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    roleName: `${clientPrefix}-task-role`,
    description: "Role that the web task definitions use to run the web sample code",
  });

    const elbFargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, `${clientPrefix}-ecs-service`, {
      cluster, 
      cpu: 512, 
      memoryLimitMiB: 1024,
      serviceName: `${clientPrefix}-ecs-service`,
      // certificate: cert, //when domain is a public domain  
      loadBalancerName: `${clientPrefix}-elb`,  
      assignPublicIp: true,
      taskSubnets: { subnets: vpc.publicSubnets },   
      desiredCount: 2,     
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry("mcr.microsoft.com/dotnet/samples:aspnetapp"),
        containerName: `${clientPrefix}-web-container`, 
        containerPort: 8080, 
        // command: ['command'],
        // entryPoint: ['entry', 'point'],
        family: `${clientPrefix}-task`,  
        taskRole: taskRole,      
        // environment: {
        //   ASPNETCORE_ENVIRONMENT: "Development",
        // }
      },
    });

    
    elbFargateService.targetGroup.configureHealthCheck({     
      path: "/healthz",      
      protocol: elb2.Protocol.HTTP,
    });

       
    // elbFargateService.targetGroup.enableCookieStickiness(cdk.Duration.hours(1), "MyLAAppCookie");
    const scalableTarget = elbFargateService.service.autoScaleTaskCount({ maxCapacity: 6, minCapacity: 2 });
   
    scalableTarget.scaleOnMemoryUtilization(`${clientPrefix}-ScaleUpMem`, {
      targetUtilizationPercent: 75,
    });

    scalableTarget.scaleOnCpuUtilization(`${clientPrefix}-ScaleUpCPU`, {
      targetUtilizationPercent: 75,
    });

    this.vpc = vpc;
    this.clientName = clientName;
    this.envName = props.envName; 
    this.ecs = cluster;    


     // outputs to be used in code deployments
     new cdk.CfnOutput(this, `${props.envName}-serviceName`, {
      exportName: `${props.envName}-serviceName`,
      value: elbFargateService.service.serviceName,
    });

    new cdk.CfnOutput(this, `${props.envName}-clusterName`, {
      exportName: `${props.envName}-clusterName`,
      value: cluster.clusterName,
    });
  }
}
