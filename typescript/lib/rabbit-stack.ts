import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elb2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns"; 
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ec2 from "aws-cdk-lib/aws-ec2";

interface RabbitStackProps extends cdk.StackProps {
  clientName: string;
  envName: string;
  cluster: ecs.ICluster;
  hosted: string;
  region: string;
  zone: route53.IHostedZone;
}

export class RabbitStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: RabbitStackProps) {
    super(scope, id, props);
       
    const clientName = props.clientName;
    const clientPrefix = `${clientName}-${props.envName}`;   
    
  // the role assumed by the task and its containers
  //might not need this
  const taskRole = new iam.Role(this, `${clientPrefix}-r-task-role`, {
    assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    roleName: `${clientPrefix}-r-task-role`,
    description: "Role that the web task definitions use to run the web sample code",
  });
  
  const image = ecs.ContainerImage.fromRegistry("rabbitmq:3.12.14-management");   

  const taskDef = new ecs.FargateTaskDefinition(this, `${clientPrefix}-r-task-def`, {
    taskRole: taskRole,
    family: `${clientPrefix}-r-task`,  
    memoryLimitMiB: 1024,  
    cpu: 512,
  });
  taskDef.addContainer(`${clientPrefix}-r-container`, { 
    image: image, 
    containerName: `${clientPrefix}-r-container`,   
    portMappings: [
      {containerPort: 15672 },
      {containerPort: 5672}
    ],  
    logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${clientPrefix}-r-container` }),    
  });

  const elbFargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, `${clientPrefix}-r-service`, {
      cluster:props.cluster, 
      cpu: 512, 
      memoryLimitMiB: 1024,
      serviceName: `${clientPrefix}-r-service`,      
      listenerPort: 80, 
      domainZone: props.zone, 
      targetProtocol: elb2.ApplicationProtocol.HTTP,
      loadBalancerName: `${clientPrefix}-r-elb`, 
      taskSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, //don't need to be public
      //assignPublicIp: true,  //service doesn't need to be public       
      desiredCount: 1,  
      circuitBreaker: { rollback: true }, //to stop and rollback instead of running for hours trying to fix itself
      taskDefinition: taskDef,
    });

    // elbFargateService.targetGroup.configureHealthCheck({     
    //   path: "/hc/ready", 
    //   protocol: elb2.Protocol.HTTPS,
    // });    
   
     // if we want to use sticky sessions
    // elbFargateService.targetGroup.enableCookieStickiness(cdk.Duration.hours(1), "MyLAAppCookie");
    const scalableTarget = elbFargateService.service.autoScaleTaskCount({ maxCapacity: 2, minCapacity: 1 });

    //add an alias in Route53 that points to the load balancer 
    // new route53.ARecord(this, `${props.hosted}-ARecord`, {
    //   recordName: props.hosted,
    //   target: route53.RecordTarget.fromAlias(
    //     new route53targets.LoadBalancerTarget(elbFargateService.loadBalancer)
    //   ),
    //   ttl: cdk.Duration.seconds(300),
    //   comment: `${props.envName} ${props.hosted} Arecord`,
    //   region: `${props.region}`,
    //   zone: props.zone,
    // });
     
    //when to scale up or down
    //scale up when cpu or memory is at 75%
    scalableTarget.scaleOnMemoryUtilization(`${clientPrefix}-r-ScaleUpMem`, {
      targetUtilizationPercent: 75,
    });

    scalableTarget.scaleOnCpuUtilization(`${clientPrefix}-r-ScaleUpCPU`, {
      targetUtilizationPercent: 75,
    });

     // cloud formation outputs
    //  new cdk.CfnOutput(this, `${props.envName}-serviceName`, {
    //   exportName: `${props.envName}-serviceName`,
    //   value: elbFargateService.service.serviceName,
    // });    
  }
}
