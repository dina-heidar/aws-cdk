import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elb2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as cm from "aws-cdk-lib/aws-certificatemanager";

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

    vpc.stack.tags.setTag("client", props.clientName);
    vpc.stack.tags.setTag("environment", props.envName);    


    //add secret to get container later from private registry
    // const appdmApiKeyName = new cdk.CfnParameter(this, 'appdmApiKey', {
    //   type: 'String',
    //   noEcho: true
    // });
    
    // const apiKeySecret = new secrets.Secret(this, 'AppDm Docker API Key', {
    //   secretName: 'appdmApiKey',
    //   secretStringValue:  cdk.SecretValue.unsafePlainText(
    //     appdmApiKeyName.valueAsString      
    //   ),
    // });


      // load balancer resources
      const elb = new elb2.ApplicationLoadBalancer(
        this,
        `${clientPrefix}-elb`,
        {
          vpc,
          vpcSubnets: { subnets: vpc.publicSubnets },
          internetFacing: true,     
        }
      );
    
    const zone = new route53.PrivateHostedZone(this, `${clientPrefix}-zone`, {
      vpc: vpc,      
      zoneName: hosted,      
      comment: `${props.envName} sample web domain`
    });

    
    new route53.ARecord(this, `${clientPrefix}-domain`, {
      recordName: `${hosted}`,
      target: route53.RecordTarget.fromAlias(
        new route53targets.LoadBalancerTarget(elb)
      ),
      ttl: cdk.Duration.seconds(300),
      comment: `${props.envName} sample web domain`,
      region: `${props.region}`,
      zone: zone,
    });

    // aws cert manager doesn't validation against dns so trying this
    // new route53.CnameRecord(this, `${clientPrefix}-www-domain`, {
    //   zone: zone,
    //   region: `${props.region}`,
    //   recordName: `www.${hosted}`,
    //   domainName: `${hosted}`,
    //   ttl: cdk.Duration.seconds(300),
    //   comment: `${props.envName} sample web domain`,
    // });

   

    const targetGroupHttp = new elb2.ApplicationTargetGroup(
      this,
      `${clientPrefix}-target-group`,
      {
        port: 80,
        vpc,
        protocol: elb2.ApplicationProtocol.HTTP,
        targetType: elb2.TargetType.IP,
        //stickinessCookieDuration: cdk.Duration.hours(1), // Enable Sticky Sessions
        //stickinessCookieName: 'MyLAAppCookie', // Set the name of the stickiness cookie   
      }
    );

    targetGroupHttp.configureHealthCheck({
      path: "/healthz",
      protocol: elb2.Protocol.HTTP,
    });

    // const cert = new cm.Certificate(
    //   this,
    //   `${clientPrefix}-cert`,
    //   {
    //     domainName: `${hosted}`,
    //     subjectAlternativeNames: [`*.${hosted}`],
    //     validation: cm.CertificateValidation.fromDns(zone),
    //   });


    const listener = elb.addListener("Listener", {
      open: true,
      port: 80,     
      protocol: elb2.ApplicationProtocol.HTTP,     
      // certificates: [cert],
    });

    listener.addTargetGroups(`${clientPrefix}-tg`, {
      targetGroups: [targetGroupHttp],
    });

    const elbSG = new ec2.SecurityGroup(this, `${clientPrefix}-elbSG`, {
      vpc,
      allowAllOutbound: true,      
    });

    elbSG.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),     
      "Allow http traffic"
    );

    elb.addSecurityGroup(elbSG);
        
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

    const taskDefinition = new ecs.TaskDefinition(this, `${clientPrefix}-ecs-task-def`, {
      cpu: "256",
      memoryMiB: "512",
      family: `${clientPrefix}-task`,      
      compatibility: ecs.Compatibility.EC2_AND_FARGATE,     
      networkMode: ecs.NetworkMode.AWS_VPC,
      taskRole: taskRole,
    });

    const container = taskDefinition.addContainer(`${clientPrefix}-web-container`, {
      memoryLimitMiB: 512,
      environment: {
        ASPNETCORE_ENVIRONMENT: "Development",
      },
      image: ecs.ContainerImage.fromRegistry("mcr.microsoft.com/dotnet/samples:aspnetapp"),
      logging: ecs.LogDriver.awsLogs({ streamPrefix: "dina-web-logs" }),
    });

    container.addPortMappings({ containerPort: 8080 });

    const ecsSG = new ec2.SecurityGroup(this, `${clientPrefix}-ecs-sg`, {
      vpc,
      allowAllOutbound: true,
    });

    ecsSG.connections.allowFrom(
      elbSG,
      ec2.Port.allTcp(),
      "Application load balancer"
    );

    const service = new ecs.FargateService(this, `${clientPrefix}-ecs-service`, {
      cluster,
      desiredCount: 2,
      taskDefinition,
      securityGroups: [ecsSG],
      // assignPublicIp: true,
    });

    service.attachToApplicationTargetGroup(targetGroupHttp);

    const scalableTaget = service.autoScaleTaskCount({
      minCapacity: 2,
      maxCapacity: 5,
    });

    scalableTaget.scaleOnMemoryUtilization(`${clientPrefix}-ScaleUpMem`, {
      targetUtilizationPercent: 75,
    });

    scalableTaget.scaleOnCpuUtilization(`${clientPrefix}-ScaleUpCPU`, {
      targetUtilizationPercent: 75,
    });


    cluster.stack.tags.setTag("client", props.clientName);
    cluster.stack.tags.setTag("environment", props.envName);    
    
    this.vpc = vpc;
    this.clientName = clientName;
    this.envName = props.envName; 
    this.ecs = cluster;    


     // outputs to be used in code deployments
     new cdk.CfnOutput(this, `${props.envName}ServiceName`, {
      exportName: `${props.envName}ServiceName`,
      value: service.serviceName,
    });

    new cdk.CfnOutput(this, `${props.envName}ClusterName`, {
      exportName: `${props.envName}ClusterName`,
      value: cluster.clusterName,
    });
  }
}
