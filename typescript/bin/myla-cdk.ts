#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EcsStack } from '../lib/ecs-stack';
import { EcsAnywhereStack } from '../lib/ecs-anywhere-stack';
import { StateFulStack } from '../lib/stateful-stack';
import { NetBaseStack } from '../lib/netBase-stack';

enum EnvName{
  DEV = "dev",
  PROD = "prod"
}

const app = new cdk.App();
const env = {account: '654654599146',  region: 'us-east-1' }

const netBaseStack = new NetBaseStack(app, 'NetBaseStack', {
  clientName: 'dina', //'ots-CCoE',
  envName: EnvName.DEV,
  hosted: "ecs.my.la.gov",
  region: "us-east-1",
  cidr: "10.13.0.0/16",
  env
});

const statefulStack= new StateFulStack(app, 'StateFulStack', { 
  clientName: netBaseStack.clientName,
  envName: netBaseStack.envName,
  vpc: netBaseStack.vpc,
  cluster: netBaseStack.cluster,
  clusterAnywhere: netBaseStack.clusterAnywhere,
  env
});

new EcsStack(app, 'EcsStack', {     
    clientName: netBaseStack.clientName,
    envName: netBaseStack.envName,    
    cluster: netBaseStack.cluster,   
    rds: statefulStack.rds,
    hosted: netBaseStack.hosted,
    certificateArn: 'arn:aws:acm:us-east-1:654654599146:certificate/72fcdfb5-addf-4846-8883-07c41e6edf40',
    region: netBaseStack.region,
    zone: netBaseStack.zone,
    env
});

new EcsAnywhereStack(app, 'EcsAnywhereStack', {     
  clientName: netBaseStack.clientName,
  envName: netBaseStack.envName,    
  cluster: netBaseStack.clusterAnywhere,
  rds: statefulStack.rds,
  hosted: netBaseStack.hosted,
  certificateArn: 'arn:aws:acm:us-east-1:654654599146:certificate/72fcdfb5-addf-4846-8883-07c41e6edf40',
  region: netBaseStack.region,  
  env
});

cdk.Tags.of(app).add('client', netBaseStack.clientName);
cdk.Tags.of(app).add('environemnt', netBaseStack.envName);