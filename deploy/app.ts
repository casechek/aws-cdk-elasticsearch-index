#!/usr/bin/env ts-node
import { App, CfnOutput, Construct, Stack, StackProps } from '@aws-cdk/core';
import { Peer, Port, SecurityGroup, Vpc } from '@aws-cdk/aws-ec2';
import { ElasticsearchIndex } from '../lib';
import { CfnDomain } from '@aws-cdk/aws-elasticsearch';

interface TestStackProps extends StackProps {
  vpcId: string;
  vpcAzs: string[];
  privateSubnetIds: string[];
  indexName: string;
  mappingJSONPath: string;
  ingressCidrs: string[];
}

export class TestStack extends Stack {
  constructor(scope: Construct, id: string, props: TestStackProps) {
    super(scope, id, props);

    const vpc = Vpc.fromVpcAttributes(this, 'VpcId2', {
      vpcId: props.vpcId,
      availabilityZones: props.vpcAzs,
      privateSubnetIds: props.privateSubnetIds,
    });

    const esSecurityGroup = new SecurityGroup(this, 'ESSecurityGroup', {
      securityGroupName: `${this.stackName}-elasticsearch-sg`,
      vpc,
      allowAllOutbound: true,
    });

    for (const ingressCidr of props.ingressCidrs) {
      esSecurityGroup.addIngressRule(
        Peer.ipv4(ingressCidr),
        Port.tcp(443),
        'Allow ingress to ES from GP'
      );
    }

    const elasticsearchDomain = new CfnDomain(this, 'ElasticsearchDomain', {
      accessPolicies: {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: {
              AWS: '*',
            },
            Action: 'es:*',
            Resource: `arn:aws:es:${this.region}:${this.account}:domain/${this.stackName}/*`,
          },
        ],
      },
      ebsOptions: {
        ebsEnabled: true,
        volumeSize: 20,
        volumeType: 'standard',
      },
      elasticsearchClusterConfig: {
        instanceCount: 1,
        instanceType: 't2.medium.elasticsearch',
      },
      domainName: this.stackName,
      encryptionAtRestOptions: {
        enabled: false,
      },
      nodeToNodeEncryptionOptions: {
        enabled: true,
      },
      vpcOptions: {
        securityGroupIds: [esSecurityGroup.securityGroupId],
        subnetIds: [props.privateSubnetIds[0]],
      },
      elasticsearchVersion: '7.1',
    });

    const es = new ElasticsearchIndex(this, 'ElasticsearchIndex', {
      mappingJSONPath: props.mappingJSONPath,
      elasticSearchIndex: props.indexName,
      elasticSearchDomain: `https://${elasticsearchDomain.attrDomainEndpoint}`,
      vpc,
      policyArn: elasticsearchDomain.attrArn,
    });

    // tslint:disable-next-line:no-unused-expression
    new CfnOutput(this, 'ESEndpoint', {
      exportName: `ESEndpoint-${this.stackName}`,
      value: `https://${elasticsearchDomain.attrDomainEndpoint}`,
    });

    // tslint:disable-next-line:no-unused-expression
    new CfnOutput(this, 'ESIndexName', {
      exportName: `ESIndexName-${this.stackName}`,
      value: es.indexName,
    });
  }
}

const app = new App();
const stack = new TestStack(app, app.node.tryGetContext('stackName'), {
  vpcId: app.node.tryGetContext('vpcId'),
  vpcAzs: app.node.tryGetContext('vpcAzs').split(','),
  privateSubnetIds: app.node.tryGetContext('privateSubnetIds').split(','),
  indexName: app.node.tryGetContext('indexName'),
  mappingJSONPath: app.node.tryGetContext('mappingJSONPath'),
  ingressCidrs: app.node.tryGetContext('ingressCidrs').split(','),
});
