import * as cdk from "aws-cdk-lib";
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import { NagSuppressions } from 'cdk-nag';
import * as ecr from "aws-cdk-lib/aws-ecr";

interface RabbitAnywhereStackProps extends cdk.StackProps {
    clientName: string;
    envName: string;
    cluster: ecs.ICluster;    
    hosted: string;
    region: string;
  }

export class RabbitAnywhereStack extends cdk.Stack {
  
    public readonly service: ecs.ExternalService;
    public readonly repo: codecommit.Repository;
  
    constructor(scope: Construct, id: string, props: RabbitAnywhereStackProps) {
          super(scope, id, props);

    const clientName = props.clientName;
    const clientPrefix = `${clientName}-${props.envName}`;   

    // Create task role
    // ECS task role
    const taskRole  = new iam.Role(this,`${clientPrefix}-mq-anywhere-task-role`, {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      roleName: `${clientPrefix}-mq-anywhere-task-role`,
      description: "Role that the web mq anywhere task definitions use to run the web sample code",    
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
  
    const repository = ecr.Repository.fromRepositoryName(this, 'rabbitmq', 'rabbitmq');
    const image = ecs.ContainerImage.fromEcrRepository(repository, '3.12.14-management');         
    
    // Create ExternalTaskDefinition
    const taskDef = new ecs.ExternalTaskDefinition(this, `${clientPrefix}-task-mq-anywhere-def`, {
        taskRole: taskRole ,
        family: "mq-anywhere",
        networkMode: ecs.NetworkMode.BRIDGE, //this should be bridge by default but just in case        
    });
    
    taskDef.addToExecutionRolePolicy(executionRolePolicy);

    NagSuppressions.addResourceSuppressions(taskDef,[{id: 'AwsSolutions-IAM5',reason: 'Suppress all AwsSolutions-IAM5 findings'}],true);
  
    taskDef.addContainer(`${clientPrefix}-mq-anywhere-web-container`, {        
        //user: "1654",  //user defined in image
        memoryLimitMiB: 1024,
        image: image, //use the image from the ecr 
        containerName: "mq-anywhere-container",
        portMappings: [
          {containerPort: 15672},
          {containerPort: 5672},
          {containerPort: 15692}
        ], 
         //these are needed for Traefik
         dockerLabels: {
          "traefik.enable":"true",
          "traefik.http.routers.rabbitMq-anywhere.entrypoints":"rabbitMq-anywhere",
          "traefik.http.routers.rabbitMq-anywhere.rule": "Host(`10.4.14.176`)" ,         
          "traefik.http.services.rabbitMq-anywhere.loadbalancer.server.port": "15672", 
          "traefik.http.routers.rabbitMq-anywhere.service":"rabbitMq-anywhere",
          "traefik.http.routers.rabbitMq-anywhere-host.rule": "Host(`rabbitMq-anywhere.la.gov`)" ,

          "traefik.http.routers.rabbitMq-prometheus.entrypoints":"rabbitMq-prometheus",
          "traefik.http.routers.rabbitMq-prometheus.rule": "Host(`10.4.14.176`)" ,         
          "traefik.http.services.rabbitMq-prometheus.loadbalancer.server.port": "15692", 
          "traefik.http.routers.rabbitMq-prometheus.service":"rabbitMq-prometheus",
          "traefik.http.routers.rabbitMq-prometheuse-host.rule": "Host(`rabbitMq-prometheus.la.gov`)" ,

          "traefik.tcp.routers.broker-anywhere.entrypoints":"broker-anywhere",         
          "traefik.tcp.routers.broker-anywhere.rule": "HostSNI(`*`)",    
          "traefik.tcp.services.broker-anywhere.loadbalancer.server.port": "5672",  
          "traefik.tcp.routers.broker-anywhere.service":"broker-anywhere"

          
        },
        //must set this logging in /etc/ecs/ecs.config as ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs"] BEFORE registration       
        //https://github.com/aws/amazon-ecs-agent/blob/master/README.md
        //https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-anywhere-registration.html#ecs-anywhere-registration
        //logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${clientPrefix}-anywhere-web-container` }),    
      });    
//********************************************************************************
//Run this section commented out first then
//after external instance is registered uncomment and run it again
    const service = new ecs.ExternalService(this, `${clientPrefix}-mq-anywhere-service`, {
      serviceName: `mq-anywhere-service`,       
      cluster: props.cluster,
      taskDefinition : taskDef,      
      desiredCount: 1
    });     
     
    service.taskDefinition.addPlacementConstraint(ecs.PlacementConstraint.memberOf("attribute:role1 == webserver"));
    this.service = service;   
//********************************************************************************

    // Create IAM Role   
    const instance_iam_role = new iam.Role(this, `${clientPrefix}-mq-anywhere-role`, {
        roleName: `${clientPrefix}-mq-anywhere-role`,
        assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
         iam.ManagedPolicy.fromManagedPolicyArn(this, "EcsAnywhereEC2Policy", "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"),
        ]
      })
      instance_iam_role.withoutPolicyUpdates();
      NagSuppressions.addResourceSuppressions(instance_iam_role,[{id: 'AwsSolutions-IAM4', reason: 'at least 10 characters'}])
    
      // cloud formation stack outputs
      // new CfnOutput(this, "RegisterExternalInstance", {
      //   description: "Create an Systems Manager activation pair",
      //   value: `aws ssm create-activation --iam-role ${instance_iam_role.roleName} | tee ssm-activation.json`,
      //   exportName: "1-RegisterExternalInstance",
      // })
  
      // new CfnOutput(this, "DownloadInstallationScript", {
      //   description: "On your VM, download installation script",
      //   value: 'curl --proto "https" -o "/tmp/ecs-anywhere-install.sh" "https://amazon-ecs-agent.s3.amazonaws.com/ecs-anywhere-install-latest.sh" && sudo chmod +x ecs-anywhere-install.sh',
      //   exportName: "2-DownloadInstallationScript",
      // });
  
      // new CfnOutput(this, "ExecuteScript", {
      //   description: "Run installation script on VM",
      //   value: "sudo ./ecs-anywhere-install.sh  --region $REGION --cluster $CLUSTER_NAME --activation-id $ACTIVATION_ID --activation-code $ACTIVATION_CODE",
      //   exportName: "3-ExecuteInstallationScript",
      // });  
  }
}