using Amazon.CDK;

namespace MyLACdk
{
    sealed class Program
    {
        public class EnvName
        {
            public const string DEV = "dev";
            public const string PROD = "prod";
        }

        public static void Main(string[] args)
        {
            var app = new App();

            // The account and region in which this stack is deployed.
            var env = new Amazon.CDK.Environment
            {
                Account = "654654599146",
                Region = "us-east-1"
            };          

            // A CDK app can contain multiple stacks. You can view a list of all the stacks in your
            // app by typing `cdk list`.

            //creates vpc, subnets, clusters, hosted zone
            var netBaseCStack = new NetBaseCStack(app, "NetBaseCStack", new NetBaseCProps
            {
                //substitute with your personal variable values here
                //in this section below
                ClientName = "dina", //agency name?
                EnvName = EnvName.DEV,
                Hosted = "ecs.my.la.gov", //the subdomain name that will be created in Route 53
                HostedAnywhere = "ecs-anywhere.my.la.gov", //the DNS entry and subdomain created by DS Admin
                Cidr = "10.13.0.0/16",
                Env = env
            });

            //creates caching db
            var stateFulCStack = new StateFulCStack(app, "StateFulCStack", new StateFulCProps
            {
                ClientName = netBaseCStack.clientName,
                EnvName = EnvName.DEV,
                Vpc = netBaseCStack.vpc,
                Cluster = netBaseCStack.cluster,
                ClusterAnywhere = netBaseCStack.clusterAnywhere,
                Env = env
            });

            new EcsCStack(app, "EcsCStack", new EcsCStackProps
            {
                ClientName = netBaseCStack.clientName,
                EnvName = netBaseCStack.envName,
                Cluster = netBaseCStack.cluster,
                Rds = stateFulCStack.rds,
                Hosted = netBaseCStack.hosted,
                //previously created certificate in AWS ACM
                CertificateArn = "arn:aws:acm:us-east-1:654654599146:certificate/72fcdfb5-addf-4846-8883-07c41e6edf40",
                Region = netBaseCStack.Region,
                Zone = netBaseCStack.zone,
                Env = env
            });

            new EcsAnywhereCStack(app, "EcsAnywhereCStack", new EcsAnywhereCStackProps
            {
                Description = "ECS Anywhere Stack",
                ClientName = netBaseCStack.clientName,
                EnvName = netBaseCStack.envName,
                Cluster = netBaseCStack.clusterAnywhere,
                Rds = stateFulCStack.rds,
                Hosted = netBaseCStack.hosted,
                Region = netBaseCStack.Region,
                Env = env
            });

            new LoadBalancerCStack(app, "LoadBalancerCStack", new LoadBalancerCStackProps
            {
                Description= "Traefik Proxy/Load Balancer Stack",
                ClientName = netBaseCStack.clientName,
                EnvName = netBaseCStack.envName,
                Cluster = netBaseCStack.cluster,               
                HostnameAnywhere = netBaseCStack.hostedAnywhere,
                Region = netBaseCStack.Region,
                Env = env
            });

            //this will tag all the created resources
            //in all these stacks with these tags
            Tags.Of(app).Add("client", netBaseCStack.clientName);
            Tags.Of(app).Add("environment", netBaseCStack.envName);
            
            app.Synth();
        }
    }
}
