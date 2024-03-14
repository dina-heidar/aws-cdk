import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as ecs from "aws-cdk-lib/aws-ecs"; 
import { CdkResourceInitializer } from '../lib/resource-initializer'
import { CfnOutput, Duration, Stack, Token } from 'aws-cdk-lib/core'
import { DockerImageCode } from 'aws-cdk-lib/aws-lambda'
import { RetentionDays } from 'aws-cdk-lib/aws-logs'

interface StateFulStackProps extends cdk.StackProps {
    clientName: string;
    envName: string;
    vpc: ec2.IVpc;
    cluster: ecs.ICluster;
}

export class StateFulStack extends cdk.Stack {

    public readonly rds: rds.DatabaseInstance;

    constructor(scope: Construct, id: string, props: StateFulStackProps) {
      super(scope, id, props);
  
      const clientName = props.clientName;
      const clientPrefix = `${clientName}-${props.envName}`;   

      // create a security group for aurora db
      const dbSecurityGroup = new ec2.SecurityGroup(this, `${clientPrefix}-db-sg`, {
        vpc: props.vpc, // use the vpc created above
        allowAllOutbound: true, // allow outbound traffic to anywhere        
    })

    const dbPort = 1433; // default port for ms sql
      
      dbSecurityGroup.addIngressRule(
        ec2.Peer.anyIpv4(),
        ec2.Port.tcp(dbPort), // allow inbound traffic on port 1433 (mssql)
        'allow inbound traffic from anywhere to the db on port 1433'
    )
      
      //rds
      //look at docs to get version with instance type
      //https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_SQLServer.html#SQLServer.Concepts.General.VersionSupport
      const databaseCluster = new rds.DatabaseInstance(this, `${clientPrefix}-rds`, {
        engine: rds.DatabaseInstanceEngine.sqlServerEx({ version: rds.SqlServerEngineVersion.VER_15}),  
        vpc: props.vpc,
        multiAz: false, //it ignores this and still requires it created in  a multi-az
        vpcSubnets: { subnets: props.vpc.publicSubnets },   //need to access this from ssms        
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.XLARGE),        
        backupRetention: cdk.Duration.days(7), 
        publiclyAccessible: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY, //retain in production
        // databaseName: `${clientPrefix}-db`, //cannot use this for ms sql, must be null
      });

      databaseCluster.connections.allowFrom(props.cluster, ec2.Port.tcp(dbPort), "Allow from fargate cluster");      
      databaseCluster.connections.allowDefaultPortFromAnyIpv4("Allow from 1433");  

      const instanceIdentifier = databaseCluster.instanceIdentifier.toLocaleLowerCase();
      const credsSecretName = `/${id}/rds/creds/${instanceIdentifier}`.toLowerCase()
      const creds = new rds.DatabaseSecret(this, 'MysqlRdsCredentials', {
          secretName: credsSecretName,
          username: 'admin'
      })
     
      // potentially allow connections to the RDS instance...
       
      // const initializer = new CdkResourceInitializer(this, 'rds-init', {
      //   config: {
      //     credsSecretName
      //   },
      //   fnLogRetention: RetentionDays.FIVE_MONTHS,
      //   fnCode: DockerImageCode.fromImageAsset(`${__dirname}/rds-init-fn-code`, {}),
      //   fnTimeout: Duration.minutes(2),
      //   fnSecurityGroups: [],
      //   vpc: props.vpc,
      //   subnetsSelection: props.vpc.selectSubnets({
      //     subnetType: ec2.SubnetType.PUBLIC //where rds resides for now
      //   })
      // })
      // // manage resources dependency
      // initializer.customResource.node.addDependency(databaseCluster)
  
      // // allow the initializer function to connect to the RDS instance
      // databaseCluster.connections.allowFrom(initializer.function, ec2.Port.tcp(dbPort) ,"Allow from lambda")
       
      // // allow initializer function to read RDS instance creds secret
      // creds.grantRead(initializer.function)
  
      // /* eslint no-new: 0 */
      // new CfnOutput(this, 'RdsInitFnResponse', {
      //   value: Token.asString(initializer.response)
      // })

      this.rds = databaseCluster;
    
      // outputs to be used in code deployments
     new cdk.CfnOutput(this, `${props.envName}-rds`, {
      exportName: `${props.envName}-rds-Address`,
      value: databaseCluster.dbInstanceEndpointAddress,
    });
  }
}