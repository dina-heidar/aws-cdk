## Summary 
MyLA (my.la.gov) is a public facing NET6 monolithic application with a caching database. The MyLA application is on-prem and communicates with other on-prem services to create and manage citizen SSO accounts. The application currently using sql server as caching db and not redis since infrastructure team does not  support redis. 

## Project goals:
containerize MyLA 
add image to ecr or docker hub
deploy to ecs with ecs autoscaling 
use a containerized redis caching db or managed redis?
add an rds for data since we will be using a db as we expand this project in the very near future
use ssm for rds connections
set dev,  prod environments

Would like to develop IaC using CDK as a working sample to explore each ECS, ECS Anywhere, EKS, EKS Anywhere

## CDK resources needed?

### ECS

stateful
ecs cluster with fargate
rds (mssql or aurora postgres as test) -> primary and read replica as secondary and for failover?
elasticache (redis)

stateless:

s3? 
vpc
subnets (public, private)
security groups
ig and nat (for rds access?)
pipeline
ssm
alb with target group and health-check to container
iam for ecs containers to get role based access ?
route53 with health-check to alb and for domain creation?
certificate manager
cloud front? redis is caching user session data not web data but it can do both which is better for web data
waf
cloud watch
config to shut down for dev and test environments after hours ...lambda?

### ECS Anywhere
test latency between on-prem ecs and aws cloud resources
explore failover to cloud as in DR event? pilot light in cloud? 


### EKS 
explore using csi driver to ssm instead of directly using aws sdk in application

### EKS Anywhere
test latency between on-prem ecs and aws cloud resources
explore failover to cloud as in DR event? pilot light in cloud? 

