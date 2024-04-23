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
            // The account and region in which this stack is deployed.
            var env = new Amazon.CDK.Environment
            {
                Account = "654654599146",
                Region = "us-east-1"
            };
            var app = new App();

            // A CDK app can contain multiple stacks. You can view a list of all the stacks in your
            // app by typing `cdk list`.

            //creates vpc, subnets, clusters, hosted zone
            var netBaseCStack = new NetBaseCStack(app, "NetBaseCStack", new NetBaseCProps
            {
                ClientName = "dina", //agency name?
                EnvName = EnvName.DEV,
                Hosted = "ecs.my.la.gov",
                HostedAnywhere = "ecs-anywhere.my.la.gov",
                Cidr = "10.13.0.0/16",
                Env = env
            });

            //creates caching db
            new StateFulCStack(app, "StateFulCStack", new StateFulCProps
            {
                ClientName = netBaseCStack.clientName,
                EnvName = EnvName.DEV,
                Vpc = netBaseCStack.vpc,
                Cluster = netBaseCStack.cluster,
                ClusterAnywhere = netBaseCStack.clusterAnywhere,
                Env = env
            });

            app.Synth();
        }
    }
}
