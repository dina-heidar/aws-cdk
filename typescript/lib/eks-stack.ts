import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as eks from "aws-cdk-lib/aws-eks";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";

interface EksStackProps extends cdk.StackProps {
    clientName: string;
    envName: string;
    vpc: ec2.IVpc;    
    rds: rds.DatabaseInstance;
    hosted: string;
    certificateArn: string;
    region: string;
    //zone: route53.IHostedZone;
  }

  //TODO : need to re-orgainze all this in NetBaseStack
  //put the clusters and secrets in NetBaseStack
  export class EksStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: EksStackProps) {
      super(scope, id, props);

      const clientName = props.clientName;
      const clientPrefix = `${clientName}-${props.envName}`;    

        new eks.FargateCluster(this, `${clientPrefix}-eks-cluster`, {
            version: eks.KubernetesVersion.V1_29,
            defaultProfile: {
        });
    }
}