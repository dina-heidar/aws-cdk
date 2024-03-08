import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as rds from "aws-cdk-lib/aws-rds";

interface StateFulStackProps extends cdk.StackProps {
    clientName: string;
    envName: string;
    vpc: ec2.IVpc;
}

export class StateFulStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: StateFulStackProps) {
      super(scope, id, props);
  
      const clientName = props.clientName;
      const clientPrefix = `${clientName}-${props.envName}`;    
      
      //rds
      //look at docs to get version with instance type
      //https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_SQLServer.html#SQLServer.Concepts.General.VersionSupport
      const db = new rds.DatabaseInstance(this, `${clientPrefix}-rds`, {
        engine: rds.DatabaseInstanceEngine.sqlServerEx({ version: rds.SqlServerEngineVersion.VER_15}),  
        vpc: props.vpc,
        multiAz: false, //it ignores this and still requires it created in  a multi-az
        vpcSubnets: { subnets: props.vpc.privateSubnets },           
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.XLARGE), 
        backupRetention: cdk.Duration.days(7), 
        removalPolicy: cdk.RemovalPolicy.DESTROY, //retain in production
        // databaseName: `${clientPrefix}-db`, //cannot use this for ms sql, must be null
        credentials: rds.Credentials.fromGeneratedSecret(`sa`,{
            secretName: "mssql_secret" //will create a secret in secrets manager
        })
      });
    }
}