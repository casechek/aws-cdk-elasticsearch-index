import { After, Before, Then, When } from 'cucumber';
import { exec } from 'child_process';
import { CloudFormation } from 'aws-sdk';
import { Client } from '@elastic/elasticsearch';
import { expect } from 'chai';
import { Output, Outputs, Stacks } from 'aws-sdk/clients/cloudformation';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

let esClient: Client;
let stackName: string;
let cloudformation: CloudFormation;

Before({ tags: '@stack' }, () => {
  stackName = 'esindexprovider-' + randomBytes(6).toString('hex');
});

After({ tags: '@stack' }, async () => {
  await getCloudFormationClient()
    .deleteStack({
      StackName: stackName,
    })
    .promise();
});

function getCloudFormationClient(): CloudFormation {
  if (!cloudformation) {
    cloudformation = new CloudFormation({
      region: process.env.AWS_REGION,
    });
  }

  return cloudformation;
}

async function getESClient(): Promise<Client> {
  if (!esClient) {
    const stack = await getCloudFormationClient()
      .describeStacks({
        StackName: stackName,
      })
      .promise();

    const endpoint = (((stack.Stacks as Stacks)[0].Outputs as Outputs).find(
      x => x.OutputKey === 'ESEndpoint'
    ) as Output).OutputValue;

    esClient = new Client({
      node: endpoint,
    });
  }

  return esClient;
}

When(
  /^I a create a new stack with index named "([^"]*)" and mapping:$/,
  { timeout: 1800 * 1000 },
  async (indexName: string, mapping: string) => {
    const tmpDir = fs.mkdtempSync('.tmp-');
    const tmpFile = path.join(tmpDir, 'mapping.json');
    fs.writeFileSync(tmpFile, mapping);
    const command = [
      'cdk',
      'deploy',
      '--region',
      process.env.AWS_REGION,
      '--require-approval',
      'never',
      '--context',
      `vpcId=${process.env.VPC_ID}`,
      '--context',
      `vpcAzs=${process.env.VPC_AZS}`,
      '--context',
      `privateSubnetIds=${process.env.PRIVATE_SUBNET_IDS}`,
      '--context',
      `stackName=${stackName}`,
      '--context',
      `indexName=${indexName}`,
      '--context',
      `mappingJSONPath=${tmpFile}`,
      '--context',
      `ingressCidrs=${process.env.INGRESS_CIDRS}`,
    ];

    await new Promise((resolve, reject) => {
      exec(command.join(' '), (error, stdout) => {
        if (error) reject(error);
        resolve(stdout);
      });
    });

    fs.unlinkSync(tmpFile);
    fs.rmdirSync(tmpDir);
  }
);

Then(/^there should be an index named "([^"]*)"$/, async indexName => {
  const index = (await getESClient()).indices.exists({
    index: indexName,
  });

  // tslint:disable-next-line:no-unused-expression
  expect(index).to.not.be.null;
});

Then(
  /^the index "([^"]*)" should have mapping:$/,
  async (indexName, expected) => {
    const mapping = await (await getESClient()).indices.getMapping({
      index: indexName,
    });

    expect(mapping.body[indexName]).to.deep.equal(JSON.parse(expected));
  }
);
