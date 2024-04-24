# ECS and ECS Anywhere Sample AWS CDK code

This repo contains two projects, one written in typescript and the other written in C#. Both will produce the same resources.

The container images were exported to AWS ECR and extracted within the code. 

ACM certificate was pre-issued and secrets were pre-populated into AWS Secret Store. The certificate and secrets are called used within the projects. 

Each project will create and deploy:

* VPC
* Subnets
* Sql Server RDS for caching
* ECS Cluster   
    * ECS Service, 
    * Task definition
    * Tasks
    * ALB (load balancer)
    * Route53 public host for subdomain for ALB as alias

ECS Anywhere Cluster 
    * ECS Service, 
    * Task definition
    * Tasks
    * Traefik (proxy/load balancer) which dynamically registers and connects to containers in the external instance

Currently AVI NSX Load Balancer connects to Traefik Proxy at port 443. 

The entire project is TLS end-to-end. The deployed projects have been deployed at:

https://ecs.my.la.gov
https://ecs-anywhere.my.la.gov 
