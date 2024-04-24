using Amazon.CDK;
using Amazon.CDK.AWS.ECR;
using Amazon.CDK.AWS.ECS;
using Amazon.CDK.AWS.IAM;
using Constructs;
using System.Collections.Generic;

namespace MyLACdk
{
    // Add any properties that you want to pass to your stack
    public class LoadBalancerCStackProps : StackProps
    {
        public string ClientName { get; set; }
        public string EnvName { get; set; }
        public ICluster Cluster { get; set; }
        public string Region { get; set; }
        public string HostnameAnywhere { get; set; }
    }

    public class LoadBalancerCStack : Stack
    {
        public readonly ExternalService service;
        public readonly Repository repo;

        public LoadBalancerCStack(Construct scope, string id, LoadBalancerCStackProps props = null)
            : base(scope, id, props)
        {
            var clientName = props.ClientName;
            string clientPrefix = $"{clientName}{props.EnvName}";

            //Traefik Proxy
            // Create task role
            // ECS task role
            var taskRoleTraefik = new Role(this, $"{clientPrefix}-anywhere-taskTraefik-role", new RoleProps
            {
                AssumedBy = new ServicePrincipal("ecs-tasks.amazonaws.com"),
                RoleName = $"{clientPrefix}-anywhere-taskTraefik-role",
                Description = "Role that load balancer task definitions use to Traefik"
            });

            taskRoleTraefik.AddManagedPolicy(ManagedPolicy.FromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"));
            taskRoleTraefik.AddManagedPolicy(ManagedPolicy.FromAwsManagedPolicyName("AWSXRayDaemonWriteAccess"));


            // Grant access to Create Log group and Log Stream
            taskRoleTraefik.AddToPolicy(new PolicyStatement(new PolicyStatementProps
            {
                Actions = new string[] {
                     "logs:CreateLogGroup",
                     "logs:CreateLogStream",
                     "logs:PutLogEvents",
                     "logs:DescribeLogStreams"
                },
                Resources = new string[] { "*" }
            }));

            taskRoleTraefik.AddToPolicy(new PolicyStatement(new PolicyStatementProps
            {
                Sid = "TraefikPolicy",
                Effect = Effect.ALLOW,
                Actions = new string[] {
                    "ecs:ListClusters",
                    "ecs:DescribeClusters",
                    "ecs:ListTasks",
                    "ecs:DescribeTasks",
                    "ecs:DescribeContainerInstances",
                    "ecs:DescribeTaskDefinition",
                    "ec2:DescribeInstances",
                    "ssm:DescribeInstanceInformation",
                },
                Resources = new string[] { "*" }
            }));

            var executionRolePolicy = new PolicyStatement(new PolicyStatementProps
            {
                Effect = Effect.ALLOW,
                Resources = new string[] { "*" },
                Actions = new string[]
                {
                    "ecr:GetAuthorizationToken",
                    "ecr:BatchCheckLayerAvailability",
                    "ecr:GetDownloadUrlForLayer",
                    "ecr:BatchGetImage",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents"
                }
            });

            var repository = Repository.FromRepositoryName(this, "traefik", "traefik");
            var image = ContainerImage.FromEcrRepository(repository);

            // Create Traefik ExternalTaskDefinition
            var taskTraefikDef = new ExternalTaskDefinition(this, $"{clientPrefix}-task-anywhere-deff", new ExternalTaskDefinitionProps
            {
                TaskRole = taskRoleTraefik,
                Family = "loadbalancer"
            });

            taskTraefikDef.AddToExecutionRolePolicy(executionRolePolicy);

            var container = taskTraefikDef.AddContainer($"{clientPrefix}-anywhere-loadBalancer-Traefik-container", new ContainerDefinitionOptions
            {
                MemoryLimitMiB = 1024,
                Image = image, //use the image from the ecr for now
                ContainerName = "traefik-container",
                Hostname = props.HostnameAnywhere,
                Cpu = 256,
                MemoryReservationMiB = 128,
                PortMappings = new PortMapping[]
                 {
                    new PortMapping
                    {
                        ContainerPort = 443,
                        Protocol = Amazon.CDK.AWS.ECS.Protocol.TCP,
                        HostPort = 443
                    },
                    new PortMapping
                    {
                        ContainerPort = 80,
                        Protocol = Amazon.CDK.AWS.ECS.Protocol.TCP,
                        HostPort = 80 //will redirect to port port 443
                    },
                    new PortMapping
                    {
                        ContainerPort = 8080,
                        Protocol = Amazon.CDK.AWS.ECS.Protocol.TCP,
                        HostPort = 8080 //will redirect to port port 443
                    }
                 },
                Command = new[]
                {
                    "--api.dashboard=true",
                    "--api.insecure=true",
                    "--accesslog=true",
                    "--providers.ecs.ecsAnywhere=true",
                    "--providers.ecs.region=us-east-1",
                    "--providers.ecs.autoDiscoverClusters=true",
                    "--providers.ecs.exposedByDefault=true",
                    "--entryPoints.web.address=:80",
                    "--entryPoints.web-secure.address=:443",
                    "--serverstransport.insecureskipverify=true"
                },
                //these are needed for Traefik
                DockerLabels = new Dictionary<string, string>
                {
                    //# Global HTTP to HTTPS redirect
                    { "entrypoints.web.http.redirections.entryPoint.to","web-secure" },
                    { "entrypoints.web.http.redirections.entryPoint.scheme","https"},
                    { "entrypoints.web.http.redirections.entrypoint.permanent","true"  },
                },
                //must set this logging in /etc/ecs/ecs.config as ECS_AVAILABLE_LOGGING_DRIVERS=["json-file","awslogs"] BEFORE registration       
                //https://github.com/aws/amazon-ecs-agent/blob/master/README.md
                //https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-anywhere-registration.html#ecs-anywhere-registration
                //Logging = LogDriver.AwsLogs(new AwsLogDriverProps
                //{
                //    StreamPrefix = $"{clientPrefix}-anywhere-traefik-container"
                //}),
            });

            //********************************************************************************
            // If external instance is NOT registered yet :
            //Run this section commented out first then
            //after external instance is registered uncomment and run it again
            var service = new ExternalService(this, $"{clientPrefix}-ecs-anywhere-traefik-service",
                    new ExternalServiceProps
                    {
                        ServiceName = "traefik-service",
                        Cluster = props.Cluster,
                        TaskDefinition = taskTraefikDef,
                        DesiredCount = 1
                    });

            //make sure to add custom attribute first before running this
            //to external instance using console UI
            //can't find a way to add custom attributes yet in cdk
            service.TaskDefinition.AddPlacementConstraint(PlacementConstraint.MemberOf("attribute:role2 == loadbalancer"));
            this.service = service;

            //********************************************************************************


            // Create IAM Role
            var instance_iam_role = new Role(this, $"{clientPrefix}-ecs-anywhere-traefik-role", new RoleProps
            {
                RoleName = $"{clientPrefix}-ecs-anywhere-traefik-role",
                AssumedBy = new ServicePrincipal("ssm.amazonaws.com"),
                ManagedPolicies = new IManagedPolicy[]
                {
                    ManagedPolicy.FromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"),
                    ManagedPolicy.FromManagedPolicyArn(this,"EcsAnywhereEC2Policy", "arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role")
                }
            });

            instance_iam_role.WithoutPolicyUpdates();
        }
    }
}
