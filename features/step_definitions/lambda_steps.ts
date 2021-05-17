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

console.log('cucumber steps env:');
console.dir(process.env);

Before(async () => {
  if (process.env.S3_ENDPOINT) {
    await axios.put(`${process.env.S3_ENDPOINT}/reset`);
  }
});

When(
  /^I send an event with body:$/,
  { timeout: 60 * 1000 },
  async (event: string) => {
    const client = new Lambda({
      apiVersion: 'latest',
      endpoint: port
        ? `${process.env.AWS_ENDPOINT}:${port}`
        : process.env.AWS_ENDPOINT,
      region: process.env.AWS_REGION,
    });
    response = await client
      .invoke({
        FunctionName: functionName,
        Payload: event,
      })
      .promise();
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
  port = process.env[portEnv];
});

Given(
  /^a index configuration file "([^"]*)" exists in bucket "([^"]*)" with contents:$/,
  async (fileNameEnv, bucketNameEnv, contents) => {
    const path = `/${process.env[bucketNameEnv]}/${process.env[fileNameEnv]}`;
    await axios.put(`${process.env.S3_ENDPOINT}/mockserver/expectation`, {
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
