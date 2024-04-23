using Amazon.CDK;
using Amazon.CDK.AWS.EC2;
using Amazon.CDK.AWS.ECS;
using Amazon.CDK.AWS.Route53;
using Constructs;

namespace MyLACdk
{
    // Add any properties that you want to pass to your stack
    public class NetBaseCProps : StackProps
    {
        public string ClientName { get; set; }
        public string EnvName { get; set; }
        public string Hosted { get; set; }
        public string HostedAnywhere { get; set; }
        public string Cidr { get; set; }
    }

    public class NetBaseCStack : Stack
    {
        public readonly IVpc vpc;
        public readonly string clientName;
        public readonly string envName;
        public readonly ICluster cluster;
        public readonly ICluster clusterAnywhere;
        public readonly string hosted;
        public readonly string hostedAnywhere;
        public readonly IHostedZone zone;

        // The code that defines your CF stack goes here
        public NetBaseCStack(Construct scope, string id, NetBaseCProps props = null)
            : base(scope, id, props)
        {
            var clientName = props.ClientName;
            string clientPrefix = $"{clientName}{props.EnvName}";


            //create the vpc
            var vpc = new Vpc(this, $"{clientPrefix}-vpc", new VpcProps
            {
                MaxAzs = 2,
                VpcName = $"{clientPrefix}-vpc",
                IpAddresses = IpAddresses.Cidr(props.Cidr),
                EnableDnsHostnames = true, //used for private zones
                EnableDnsSupport = true, //used for private zones
                SubnetConfiguration = new ISubnetConfiguration[]
                {
                    new SubnetConfiguration
                    {
                        Name = $"{clientPrefix}-private-subnet",
                        SubnetType = SubnetType.PRIVATE_WITH_EGRESS,
                        CidrMask = 24
                    },
                    new SubnetConfiguration
                    {
                        Name = $"{clientPrefix}-public-subnet",
                        SubnetType = SubnetType.PUBLIC,
                        CidrMask = 24
                    }
                }
            });

            //create the ecs cluster
            var cluster = new Cluster(this, $"{clientPrefix}-cluster", new ClusterProps
            {
                Vpc = vpc, //the vpc we created above
                ClusterName = $"{clientPrefix}-ecs-cluster"
            });

            //create the ecs anywhere (on-prem) cluster
            var clusterAnywhere = new Cluster(this, $"{clientPrefix}-cluster-anywhere", new ClusterProps
            {
                Vpc = vpc, //the vpc we created above
                ClusterName = $"{clientPrefix}-ecs-anywhere-cluster"
            });

            //create the public hosted zone on route 53
            var zonePublic = new PublicHostedZone(this, $"{clientPrefix}-public-zone", new PublicHostedZoneProps
            {
                ZoneName = props.Hosted,
                Comment = $"{props.EnvName} ECS MyLA"
            });

            zonePublic.ApplyRemovalPolicy(RemovalPolicy.RETAIN); // do not destroy if this CF stack is deleted

            //assign the output variables so they can be used in other stacks
            this.vpc = vpc;
            this.clientName = clientName;
            this.envName = props.EnvName;
            this.cluster = cluster;
            this.clusterAnywhere = clusterAnywhere;
            this.hosted = props.Hosted;
            this.hostedAnywhere = props.HostedAnywhere;
            this.zone = zonePublic;
            
            //these are the outputs that will be displayed in the cloud formation console
            new CfnOutput(this, $"{props.EnvName}-clusterName", new CfnOutputProps
            {
                ExportName = $"{props.EnvName}-clusterName",
                Value = cluster.ClusterName
            });

            new CfnOutput(this, $"{props.EnvName}-anywhere-clusterName", new CfnOutputProps
            {
                ExportName = $"{props.EnvName}-anywhere-clusterName",
                Value = cluster.ClusterName
            });
        }
    }
}
