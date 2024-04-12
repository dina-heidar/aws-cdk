import * as cdk from "aws-cdk-lib";
import { Construct } from 'constructs';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as codecommit from 'aws-cdk-lib/aws-codecommit';
import { ManagedPolicy } from 'aws-cdk-lib/aws-iam';
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as sm from "aws-cdk-lib/aws-secretsmanager";
import { NagSuppressions } from 'cdk-nag';

interface LoadBalancerStackProps extends cdk.StackProps {
    clientName: string;
    envName: string;
    cluster: ecs.ICluster;
    hosted: string;
    region: string;
  }

  //TODO create Traefik Proxy
export class LoadBalancerStack extends cdk.Stack {

    public readonly service: ecs.ExternalService;
    public readonly repo: codecommit.Repository;
  
    constructor(scope: Construct, id: string, props: LoadBalancerStackProps) {
          super(scope, id, props);

    const clientName = props.clientName;
    const clientPrefix = `${clientName}-${props.envName}`;  

    //Traefik Proxy
    // Create task role
    // ECS task role
    const taskRoleTraefik  = new iam.Role(this, `${clientPrefix}-anywhere-taskTraefik-role`, {
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        roleName: `${clientPrefix}-anywhere-taskTraefik-role`,
        description: "Role that load balancer task definitions use to Traefik",    
        });

        taskRoleTraefik.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"));
        taskRoleTraefik.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"));
        NagSuppressions.addResourceSuppressions(taskRoleTraefik ,[{id: 'AwsSolutions-IAM4', reason: 'atleast 10 characters'}]);

  
        // Grant access to Create Log group and Log Stream
        taskRoleTraefik.addToPolicy(
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
      NagSuppressions.addResourceSuppressions(taskRoleTraefik ,[{id: 'AwsSolutions-IAM5',reason: 'Suppress all AwsSolutions-IAM5 findings'}],true);
  
      const executionRoleTraefikPolicy = new iam.PolicyStatement({
        sid: "TraefikECSReadAccess",
        effect: iam.Effect.ALLOW,
        resources: ['*'],
        actions: [
          //per Traefik example doc
          "ecs:ListClusters",
          "ecs:DescribeClusters",
          "ecs:ListTasks",
          "ecs:DescribeTasks",
          "ecs:DescribeContainerInstances",
          "ecs:DescribeTaskDefinition",
          "ec2:DescribeInstances",
          "ssm:DescribeInstanceInformation",
  
          //per aws sample
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
      });
  
      const repository = ecr.Repository.fromRepositoryName(this, 'traefik', 'traefik');
      const image = ecs.ContainerImage.fromEcrRepository(repository);  

      const taskTraefikDef = new ecs.ExternalTaskDefinition(this, `${clientPrefix}-taskTraefik-anywhere-def`, {
        taskRole: taskRoleTraefik ,
        family: `${clientPrefix}-ext-taskTraefik`
        });
  
    taskTraefikDef.addToExecutionRolePolicy(executionRoleTraefikPolicy);
  
    NagSuppressions.addResourceSuppressions(taskTraefikDef,[{id: 'AwsSolutions-IAM5',reason: 'Suppress all AwsSolutions-IAM5 findings'}],true);
  
    taskTraefikDef.addContainer(`${clientPrefix}-anywhere-loadBalancer-Traefik-container`, { 
        memoryLimitMiB: 1024,
        image: image, //use the image from the ecr 
        containerName: `${clientPrefix}-anywhere-traefik-container`,
        cpu: 256,
        memoryReservationMiB: 128,
        portMappings: [{ 
            containerPort: 80,
            protocol: ecs.Protocol.TCP,
            hostPort: 80 
         },
         { 
            containerPort: 8080,
            protocol: ecs.Protocol.TCP,
            hostPort: 8080 
         }], 
         command: [
            "--api.dashboard=true",
            "--api.insecure=true",
            "--accesslog=true",
            "--providers.ecs.ecsAnywhere=true",
            "--providers.ecs.region=ap-southeast-2",
            "--providers.ecs.autoDiscoverClusters=true",
            "--providers.ecs.exposedByDefault=true"
         ], 

        //must set this logging in /etc/ecs/ecs.config as ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs"] BEFORE registration       
        //https://github.com/aws/amazon-ecs-agent/blob/master/README.md
        //https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-anywhere-registration.html#ecs-anywhere-registration
        //logging: ecs.LogDrivers.awsLogs({ streamPrefix: `${clientPrefix}-anywhere-web-container` }), 
        secrets: {         
        //   "AppConfiguration__SAMLProvider__Certificate__Pem":  ecs.Secret.fromSecretsManager(samlPem), 
        //   "AppConfiguration__SAMLProvider__Certificate__RSAKey": ecs.Secret.fromSecretsManager(samlRsaKey),          
        }
    });       

    const service = new ecs.ExternalService(this, `${clientPrefix}-ecs-anywhere-traefik-service`, {
        serviceName: `${clientPrefix}-ecs-anywhere-traefik-service`,       
        cluster: props.cluster,
        taskDefinition : taskTraefikDef,      
        desiredCount: 1        
      }); 

      //can't do this unless we have custom attributes set on the external instance
   // service.taskDefinition.addPlacementConstraint(ecs.PlacementConstraint.memberOf("attribute:role == loadbalancer"));
        this.service = service; 
        
         // Create IAM Role   
    const instance_iam_role = new iam.Role(this, `${clientPrefix}-ecs-anywhere-traefik-role`, {
        roleName: `${clientPrefix}-ecs-anywhere-traefik-role`,
        assumedBy: new iam.ServicePrincipal('ssm.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
          iam.ManagedPolicy.fromManagedPolicyArn(this, "EcsAnywhereEC2Policy", "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role"),
        ]
      })
      instance_iam_role.withoutPolicyUpdates();
      NagSuppressions.addResourceSuppressions(instance_iam_role,[{id: 'AwsSolutions-IAM4', reason: 'at least 10 characters'}])
  }
}