#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { EscStack } from '../lib/ecs-stack';
import { StateFulStack } from '../lib/stateful-stack';

const app = new cdk.App();
const env = {account: '654654599146',  region: 'us-east-1' }

const ecs_Stack = new EscStack(app, 'EcsStack', {     
    clientName: 'dina', //'ots-CCoE',
    envName: "dev",
    domain: "la.gov",
    region: "us-east-1",
    env
});
 new StateFulStack(app, 'StateFulStack', { 
  clientName: ecs_Stack.clientName,
  envName: ecs_Stack.envName,
  vpc: ecs_Stack.vpc  ,
  env
});

cdk.Tags.of(app).add('client', ecs_Stack.clientName);
cdk.Tags.of(app).add('environemnt', ecs_Stack.envName);