import { Before, Given, Then, When } from 'cucumber';
import { expect } from 'chai';
import { Lambda } from 'aws-sdk';
import { AWSError } from 'aws-sdk/lib/error';
import { InvocationResponse } from 'aws-sdk/clients/lambda';
import axios from 'axios';
import { Validator } from 'jsonschema';

let response: InvocationResponse | AWSError;
let functionName: string;
let port: string | undefined;
const validator = new Validator();

const awsEndpoint = process.env.AWS_ENDPOINT ?? 'http://localhost';
const s3Endpoint = process.env.S3_ENDPOINT ?? 'http://localhost:1080';

Before(async () => {
  await axios.put(`${s3Endpoint}/reset`);
});

When(
  /^I send an event with body:$/,
  { timeout: 60 * 1000 },
  async (event: string) => {
    const client = new Lambda({
      apiVersion: 'latest',
      endpoint: port ? `${awsEndpoint}:${port}` : awsEndpoint,
      region: process.env.AWS_REGION ?? 'us-east-1',
    });
    response = await client
      .invoke({
        FunctionName: functionName,
        Payload: event,
      })
      .promise();
  }
);

When(
  /^I wait "([^"]*)" seconds$/,
  { timeout: 30 * 1000 },
  async (seconds: number) => {
    await new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
);

Then(/^the response will be equal to:$/, async (body: string) => {
  expect(
    JSON.parse(((response as InvocationResponse).Payload as Buffer).toString())
  ).to.deep.equal(JSON.parse(body));
});

Given(/^lambda function "([^"]*)"$/, functionNameEnv => {
  functionName = process.env[functionNameEnv] ?? 'myfunction';
});

Given(/^AWS port "([^"]*)"$/, portEnv => {
  port = process.env[portEnv] ?? '9001';
});

Given(
  /^a index configuration file "([^"]*)" exists in bucket "([^"]*)" with contents:$/,
  async (fileNameEnv, bucketNameEnv, contents) => {
    const path = `/${process.env[bucketNameEnv] ?? 'test-bucket'}/${process.env[
      fileNameEnv
    ] ?? 'test-object-key'}`;
    await axios.put(`${s3Endpoint}/mockserver/expectation`, {
      httpRequest: {
        path,
      },
      httpResponse: {
        body: contents,
      },
    });
  }
);

Then(/^the response will match schema:$/, schema => {
  const result = validator.validate(
    JSON.parse(((response as InvocationResponse).Payload as Buffer).toString()),
    JSON.parse(schema)
  );
  if (result.errors.length) {
    throw new Error(result.toString());
  }
});
