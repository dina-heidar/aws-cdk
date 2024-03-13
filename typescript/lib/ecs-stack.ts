import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as elb2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns"; 
import * as rds from "aws-cdk-lib/aws-rds";

interface EcsStackProps extends cdk.StackProps {
  clientName: string;
  envName: string;
  cluster: ecs.ICluster;
  rds: rds.DatabaseInstance;
}

export class EscStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);
       
    const clientName = props.clientName;
    const clientPrefix = `${clientName}-${props.envName}`;   

    const samlPem = sm.Secret.fromSecretCompleteArn(this, "samlpem","arn:aws:secretsmanager:us-east-1:654654599146:secret:SAMLProviderPem-O3bP5m");
    const samlRsaKey = sm.Secret.fromSecretCompleteArn(this, "samlkey","arn:aws:secretsmanager:us-east-1:654654599146:secret:SamlRsaKey-D3R6c5");
    const providerlPem = sm.Secret.fromSecretCompleteArn(this, "providerpem","arn:aws:secretsmanager:us-east-1:654654599146:secret:EaPem-Y32PsR");
    const providerRsaKey = sm.Secret.fromSecretCompleteArn(this, "providerKey","arn:aws:secretsmanager:us-east-1:654654599146:secret:EaKey-HDhRJz");
    
  // the role assumed by the task and its containers
  //might not need this
  const taskRole = new iam.Role(this, `${clientPrefix}-task-role`, {
    assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    roleName: `${clientPrefix}-task-role`,
    description: "Role that the web task definitions use to run the web sample code",
  });

  const dbSecret = sm.Secret.fromSecretCompleteArn(this, "db-secret",props.rds.secret!.secretArn );
  const dockerSecret = sm.Secret.fromSecretCompleteArn(this, "docker-hub-secret",props.rds.secret!.secretArn );
  
    const elbFargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, `${clientPrefix}-ecs-service`, {
      cluster:props.cluster, 
      cpu: 512, 
      memoryLimitMiB: 1024,
      serviceName: `${clientPrefix}-ecs-service`,            
      // certificate: cert, //when domain is a public domain  
      loadBalancerName: `${clientPrefix}-elb`,  
      //sslPolicy: elb2.SslPolicy.TLS12,
      assignPublicIp: true,        
      desiredCount: 2,       
      //protocolVersion: elb2.ApplicationProtocolVersion.HTTP2,   
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry("appdm/myla-dev:v1.1", {
          credentials: dockerSecret, //check the cf if for output         
        }),   
        containerName: `${clientPrefix}-web-container`,
        containerPort: 8080,                      
        // command: ['command'],
        // entryPoint: ['entry', 'point'],
        family: `${clientPrefix}-task`,  
        taskRole: taskRole,   //might not need this  
        secrets: {
          "DB_PASSWORD": ecs.Secret.fromSecretsManager(dbSecret, 'password'),
          "DB_USER": ecs.Secret.fromSecretsManager(dbSecret, 'username'),
        },       
        environment: {
          ASPNETCORE_ENVIRONMENT: "Docker",
          AppConfiguration__SAMLProvider__Certificate__Pem:  samlPem.secretValue.unsafeUnwrap(), //find a way not to do this
          AppConfiguration__SAMLProvider__Certificate__RSAKey: samlRsaKey.secretValue.unsafeUnwrap(), 
          AppConfiguration__ServiceProvider__Certificate__Pem: providerlPem.secretValue.unsafeUnwrap(), 
          AppConfiguration__ServiceProvider__Certificate__RSAKey: providerRsaKey.secretValue.unsafeUnwrap(), 
          ASPNETCORE_URLS:"http://+:8080;https://+:443" ,
          ASPNETCORE_HTTPS_PORT:"443",
          ASPNETCORE_HTTP_PORT:"8080",
          ASPNETCORE_Kestrel__Certificates__Default__Password:"1234",
          ASPNETCORE_Kestrel__Certificates__Default__Path: "/usr/local/share/ca-certificates/localhost.pfx",
          "DB_HOST": props.rds.instanceEndpoint.hostname,
          "DB_PORT": props.rds.instanceEndpoint.port.toString(),
          "DB_NAME": "SessionCache",
        }
      },
    });

    elbFargateService.targetGroup.configureHealthCheck({     
      path: "/hc/ready",      
      protocol: elb2.Protocol.HTTPS,
    });
       
    // elbFargateService.targetGroup.enableCookieStickiness(cdk.Duration.hours(1), "MyLAAppCookie");
    const scalableTarget = elbFargateService.service.autoScaleTaskCount({ maxCapacity: 6, minCapacity: 2 });
   
    scalableTarget.scaleOnMemoryUtilization(`${clientPrefix}-ScaleUpMem`, {
      targetUtilizationPercent: 75,
    });

    scalableTarget.scaleOnCpuUtilization(`${clientPrefix}-ScaleUpCPU`, {
      targetUtilizationPercent: 75,
    });

     // outputs to be used in code deployments
     new cdk.CfnOutput(this, `${props.envName}-serviceName`, {
      exportName: `${props.envName}-serviceName`,
      value: elbFargateService.service.serviceName,
    });    
  }
}
