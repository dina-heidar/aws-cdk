import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";

interface EcsStackProps extends cdk.StackProps {
  clientName: string;
  envName: string;
}

export class EscStack extends cdk.Stack {

  public readonly vpc: ec2.IVpc;
  public readonly clientName: string;
  public readonly envName: string;

  constructor(scope: Construct, id: string, props: EcsStackProps) {
    super(scope, id, props);
       
    const clientName = props.clientName;
    const clientPrefix = `${clientName}-${props.envName}`;
   
    //vpc resurces
    const vpc = new ec2.Vpc(this, `${clientPrefix}-vpc`, {
      maxAzs: 2,      
      vpcName: `${clientPrefix}-vpc`,      
      ipAddresses: ec2.IpAddresses.cidr("10.13.0.0/16"),      
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

    vpc.stack.tags.setTag("client", props.clientName)
    vpc.stack.tags.setTag("environment", props.envName);

    this.vpc = vpc;
    this.clientName = clientName;
    this.envName = props.envName;    
  }
}
