import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as cm from "aws-cdk-lib/aws-certificatemanager";

interface NetBaseStackProps extends cdk.StackProps {
  clientName: string;
  envName: string;
  hosted: string;
  region: string;
  cidr: string;
}

export class NetBaseStack extends cdk.Stack {

  public readonly vpc: ec2.IVpc;
  public readonly clientName: string;
  public readonly envName: string;
  public readonly cluster : ecs.ICluster; 
  public readonly clusterAnywhere : ecs.ICluster; 
  public readonly hosted: string;
  public readonly zone: route53.IHostedZone;

  constructor(scope: Construct, id: string, props: NetBaseStackProps) {
    super(scope, id, props);
       
    const clientName = props.clientName;
    const clientPrefix = `${clientName}-${props.envName}`;
    //const hosted = `${props.envName}.${clientName}.${props.domain}`;

    //vpc resources
    //TODO: do a lookup and see if that vpc exists
    //if not, create the dev or prod vpc
    const vpc = new ec2.Vpc(this, `${clientPrefix}-vpc`, {
      maxAzs: 2,      
      vpcName: `${clientPrefix}-vpc`,      
      ipAddresses: ec2.IpAddresses.cidr("10.13.0.0/16"),    
      enableDnsHostnames: true,  
      enableDnsSupport: true,
      subnetConfiguration: [
        {
          name: `${clientPrefix}-private-subnet`,
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,  
        },
        {
          name: `${clientPrefix}-public-subnet`,                    
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },       
      ],      
    });    

    const cluster  = new ecs.Cluster(this, `${clientPrefix}-ecs-cluster`, {
      vpc: vpc,
      clusterName: `${clientPrefix}-ecs-cluster`,    
    });     

    const clusterAnywhere  = new ecs.Cluster(this, `${clientPrefix}-ecs-anywhere-cluster`, {
      vpc: vpc,
      clusterName: `${clientPrefix}-ecs-anywhere-cluster`,    
    });     

    const zone = new route53.PrivateHostedZone(this, `${clientPrefix}-zone`, {
      vpc: vpc,      
      zoneName: props.hosted, 
      comment: `${props.envName} ECS MyLA`
    });      

    this.vpc = vpc;
    this.clientName = clientName;
    this.envName = props.envName; 
    this.cluster = cluster;   
    this.clusterAnywhere = clusterAnywhere;  
    this.hosted = props.hosted;  
    this.zone= zone;

    new cdk.CfnOutput(this, `${props.envName}-clusterName`, {
      exportName: `${props.envName}-clusterName`,
      value: cluster.clusterName,
    });
    new cdk.CfnOutput(this, `${props.envName}-anywhere-clusterName`, {
      exportName: `${props.envName}-anywhere-clusterName`,
      value: clusterAnywhere.clusterName,
    });
  }
}
