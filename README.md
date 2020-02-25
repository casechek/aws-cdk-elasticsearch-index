[![](https://img.shields.io/npm/v/@casechek/aws-cdk-elasticsearch-index)](https://www.npmjs.com/package/@casechek/aws-cdk-elasticsearch-index)
[![codecov](https://codecov.io/gh/incompass/aws-cdk-elasticsearch-index/branch/master/graph/badge.svg)](https://codecov.io/gh/incompass/aws-cdk-elasticsearch-index)
[![](https://github.com/incompass/aws-cdk-elasticsearch-index/workflows/Continuous%20Integration/badge.svg)](https://github.com/incompass/aws-cdk-elasticsearch-index/actions?query=workflow%3A%22Continuous+Integration%22)

Elasticsearch Index CDK Construct
=================================

This construct allows you to deploy an elasticsearch index and all its settings and mappings within a stack.

## Table of Contents

- [Elasticsearch Index CDK Construct](#elasticsearch-index-cdk-construct)
  * [Table of Contents](#table-of-contents)
  * [Usage](#usage)
    + [Installation](#installation)
    + [Create an Elasticsearch Domain (Optional)](#create-an-elasticsearch-domain-optional)
    + [Create an Index](#create-an-index)
  * [Contributing](#contributing)
    + [Required Software](#required-software)
    + [Obtaining the Source](#obtaining-the-source)
    + [Docker](#docker)
      - [Running the docker-compose Stack](#running-the-docker-compose-stack)
    + [Testing](#testing)
      - [Running jest tests](#running-jest-tests)
      - [Running cucumber tests](#running-cucumber-tests)
  * [Useful commands](#useful-commands)

## Usage

### Installation

Install the package in your CDK application.

```
npm install @casechek/aws-cdk-elasticsearch-index
```

### Create an Elasticsearch Domain (Optional)

This is currently in the experimental stage over at AWS; however, it is the easiest way to
setup a basic Elasticsearch cluster.

```typescript
// in your stack constructor
import {CfnDomain} from '@aws-cdk/aws-cdk-elasticsearch-index';

const elasticsearchDomain = new CfnDomain(
  this,
  'ElasticsearchDomain',
  {
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
      securityGroupIds: [securityGroupIdFromSomewhere],
      subnetIds: [privateSubnetIdFromSomewhere],
    },
    elasticsearchVersion: '7.1',
  }
);
```

### Create an Index

The construct 
```typescript
import {ElasticsearchIndex} from 'aws-cdk-elasticsearch-index'
const es = new ElasticsearchIndex(this, 'ElasticsearchIndex', {
  mappingJSONPath: PATH_TO_A_JSON_FILE_CONTAINING_FULL_INDEX_CONFIGURATION,
  elasticSearchIndex: NAME_OF_THE_INDEX_TO_CREATE,
  elasticSearchEndpoint: FULL_URL_TO_THE_ELASTICSEARCH_ENDPOINT_INCLUDING_SCHEME,
  vpc: VPC_OF_YOUR_ELASTIC_SEARCH_DOMAIN, // If you want to host the lambda functions responsible for resource creation in your vpc
  policyArn: elasticsearchDomain.attrArn, // where elasticSearch domain is your elasticsearch CDK construct instance, only required if you are using AWS Elasticsearch
});
```

## Contributing

### Required Software

* git
* docker
* docker-compose
* nodejs
* aws-cdk

### Obtaining the Source

```bash
git clone git@github.com:incompass/aws-cdk-elasticsearch-domain
```

### Docker

To help contributing to this project, a `docker-compose` configuration is provided that includes:

* lambci/docker-lambda for the `on-event` lambda function
* elasticsearch
* kibana
* mockserver

#### Running the docker-compose Stack

```bash
docker-compose up
```

### Testing

This package includes both jest and cucumber-js tests. Jest is used for unit testing the lambda functions
and for testing the cdk stack using the AWS supplied helpers. Cucumber is used for e2e testing the lambda
functions. All contributions must include relevant tests.

#### Running jest tests

```bash
npm run test
```

#### Running cucumber tests

You need to start the `docker-compose` stack before running the end to end tests. In one terminal, run:

```bash
docker-compose up
```

In another window, set the appropriate environment variables and run cucumber:

##### Bash:

```bash
AWS_ENDPOINT=http://localhost \
AWS_REGION=us-east-1 \
S3_ENDPOINT=http://localhost:1080 \
ON_EVENT_PORT=9001 \
ON_EVENT_S3_BUCKET_NAME=test-bucket \
ON_EVENT_S3_OBJECT_KEY=test-object-key \
ON_EVENT_INDEX=test-index \
ELASTICSEARCH_ENDPOINT=http://localhost:9200 \
ELASTICSEARCH_INDEX=test-index \
npm run cucumber -- --tags "not @stack"
```

##### Powershell:

```powershell
$env:AWS_ENDPOINT='http://localhost';
$env:AWS_REGION='us-east-1';
$env:S3_ENDPOINT='http://localhost:1080';
$env:ON_EVENT_PORT='9001';
$env:ON_EVENT_S3_BUCkET_NAME='test-bucket';
$env:ON_EVENT_S3_OBJECT_KEY='test-object-key';
$env:ON_EVENT_INDEX='test-index';
$env:ELASTICSEARCH_ENDPOINT='http://localhost:9200';
$env:ELASTICSEARCH_INDEX='test-index';
npm run cucumber -- --tags "not @stack"
```

### Commit Messages

This package uses the conventional commit message format. All PRs will be squashed and merged.

## Useful commands

 * `npm run build`    compile typescript to js
 * `npm run watch`    watch for changes and compile
 * `npm run test`     perform the jest unit tests
 * `npm run cucumber` perform the cucumber e2e tests
