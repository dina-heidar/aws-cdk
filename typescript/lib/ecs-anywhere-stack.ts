import * as cdk from "aws-cdk-lib";
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { CfnOutput } from 'aws-cdk-lib';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import * as rds from "aws-cdk-lib/aws-rds";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import { NagSuppressions } from 'cdk-nag';
import * as ecr from "aws-cdk-lib/aws-ecr";

interface EcsAnywhereStackProps extends cdk.StackProps {
    clientName: string;
    envName: string;
    cluster: ecs.ICluster;
    rds: rds.DatabaseInstance;
    hosted: string;
    certificateArn: string;
    region: string;
  }

  //TODO create Traefik Proxy
export class EcsAnywhereStack extends cdk.Stack {

    public readonly service: ecs.ExternalService;
    public readonly repo: codecommit.Repository;
  
    constructor(scope: Construct, id: string, props: EcsAnywhereStackProps) {
          super(scope, id, props);

    const clientName = props.clientName;
    const clientPrefix = `${clientName}-${props.envName}`;   

    const samlPem = sm.Secret.fromSecretCompleteArn(this, "samlpem","arn:aws:secretsmanager:us-east-1:654654599146:secret:SAMLProviderPem-O3bP5m");
    const samlRsaKey = sm.Secret.fromSecretCompleteArn(this, "samlkey","arn:aws:secretsmanager:us-east-1:654654599146:secret:SamlRsaKey-D3R6c5");
    const providerlPem = sm.Secret.fromSecretCompleteArn(this, "providerpem","arn:aws:secretsmanager:us-east-1:654654599146:secret:EaPem-Y32PsR");
    const providerRsaKey = sm.Secret.fromSecretCompleteArn(this, "providerKey","arn:aws:secretsmanager:us-east-1:654654599146:secret:EaKey-HDhRJz");
    
    // Create task role
    // ECS task role
    const taskRole  = new iam.Role(this, `${clientPrefix}-anywhere-task-role`, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: `${clientPrefix}-anywhere-task-role`,
      description: "Role that the web anywhere task definitions use to run the web sample code",
    });

    taskRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"))
    taskRole.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"));
    NagSuppressions.addResourceSuppressions(taskRole ,[{id: 'AwsSolutions-IAM4', reason: 'atleast 10 characters'}])

    // Grant access to Create Log group and Log Stream
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams"
        ],
        resources: [
          "arn:aws:logs:*:*:*"
        ]
      })
    )
    NagSuppressions.addResourceSuppressions(taskRole ,[{id: 'AwsSolutions-IAM5',reason: 'Suppress all AwsSolutions-IAM5 findings'}],true);

    const executionRolePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: ['*'],
      actions: [
        "ecr:GetAuthorizationToken",
        "ecr:BatchCheckLayerAvailability",
        "ecr:GetDownloadUrlForLayer",
        "ecr:BatchGetImage",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
    });

    const dbSecret = sm.Secret.fromSecretCompleteArn(this, "db-secret",props.rds.secret!.secretArn );
    const repository = ecr.Repository.fromRepositoryName(this, 'myla-dev', 'myla-dev');
    const image = ecs.ContainerImage.fromEcrRepository(repository, '1.2');     
    
    // Create ExternalTaskDefinition
    const taskDef = new ecs.ExternalTaskDefinition(this, `${clientPrefix}-task-anywhere-def`, {
        taskRole: taskRole ,
        family: `${clientPrefix}-ext-task`,
        networkMode: ecs.NetworkMode.BRIDGE, //this should be bridge by default but just in case
    });

    taskDef.addToExecutionRolePolicy(executionRolePolicy);

    NagSuppressions.addResourceSuppressions(taskDef,[{id: 'AwsSolutions-IAM5',reason: 'Suppress all AwsSolutions-IAM5 findings'}],true);
 
    taskDef.addContainer(`${clientPrefix}-anywhere-web-container`, {   
        user: "1654",  
        memoryLimitMiB: 1024,
        image: image, //use the image from the ecr 
        containerName: `${clientPrefix}-anywhere-web-container`,
        portMappings: [{ 
            containerPort: 8443,
            hostPort: 443
         }], 
        //logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${clientPrefix}-anywhere-web-container` }),
        secrets: {
          "DB_PASSWORD": ecs.Secret.fromSecretsManager(dbSecret, 'password'),
          "DB_USER": ecs.Secret.fromSecretsManager(dbSecret, 'username'),
          "AppConfiguration__SAMLProvider__Certificate__Pem":  ecs.Secret.fromSecretsManager(samlPem), 
          "AppConfiguration__SAMLProvider__Certificate__RSAKey": ecs.Secret.fromSecretsManager(samlRsaKey), 
          "AppConfiguration__ServiceProvider__Certificate__Pem": ecs.Secret.fromSecretsManager(providerlPem), 
          "AppConfiguration__ServiceProvider__Certificate__RSAKey": ecs.Secret.fromSecretsManager(providerRsaKey), 
        },    
        environment: {
          ASPNETCORE_ENVIRONMENT: "Docker",          
          ASPNETCORE_URLS:"https://*:8443;http://*:8080" ,
          ASPNETCORE_Kestrel__Certificates__Default__Password:"1234", //TODO put this in password section
          ASPNETCORE_Kestrel__Certificates__Default__Path: "/usr/local/share/ca-certificates/localhost.pfx",
          "DB_HOST": props.rds.instanceEndpoint.hostname,
          "DB_PORT": props.rds.instanceEndpoint.port.toString(),
          "DB_NAME": "SessionCache",
        }        
      });    
  
    //Create ExternalService
    interface ExternalServiceProps extends ecs.BaseServiceProps {
      placementStrategies?: ecs.PlacementStrategy[];
    }

    const service = new ecs.ExternalService(this, `${clientPrefix}-ecs-anywhere-service`, {
      serviceName: `${clientPrefix}-ecs-anywhere-service`,       
      cluster: props.cluster,
      taskDefinition : taskDef,      
      desiredCount: 1,      
    });   
  
    this.service = service;   

    // Create IAM Role   
    const instance_iam_role = new iam.Role(this, `${clientPrefix}-ecs-anywhere-role`, {
        roleName: `${clientPrefix}-ecs-anywhere-role`,
        assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
          iam.ManagedPolicy.fromManagedPolicyArn(this, "EcsAnywhereEC2Policy", "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"),
        ]
      })
      instance_iam_role.withoutPolicyUpdates();
      NagSuppressions.addResourceSuppressions(instance_iam_role,[{id: 'AwsSolutions-IAM4', reason: 'at least 10 characters'}])
  
  
      new CfnOutput(this, "RegisterExternalInstance", {
        description: "Create an Systems Manager activation pair",
        value: `aws ssm create-activation --iam-role ${instance_iam_role.roleName} | tee ssm-activation.json`,
        exportName: "1-RegisterExternalInstance",
      })
  
      new CfnOutput(this, "DownloadInstallationScript", {
        description: "On your VM, download installation script",
        value: 'curl --proto "https" -o "/tmp/ecs-anywhere-install.sh" "https://amazon-ecs-agent.s3.amazonaws.com/ecs-anywhere-install-latest.sh" && sudo chmod +x ecs-anywhere-install.sh',
        exportName: "2-DownloadInstallationScript",
      });
  
      new CfnOutput(this, "ExecuteScript", {
        description: "Run installation script on VM",
        value: "sudo ./ecs-anywhere-install.sh  --region $REGION --cluster $CLUSTER_NAME --activation-id $ACTIVATION_ID --activation-code $ACTIVATION_CODE",
        exportName: "3-ExecuteInstallationScript",
      });  
  }
}