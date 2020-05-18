import { expect as expectCDK, haveResource } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as path from 'path';
import { ElasticsearchIndex } from '../../lib';

describe('Elasticsearch Index Custom Resource Stack', () => {
  it('Creates On Event Handler', async () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    // WHEN
    // tslint:disable-next-line:no-unused-expression
    new ElasticsearchIndex(
      stack,
      'MyTestConstruct',
      {
        mappingJSONPath: path.join(__dirname, 'resources', 'mapping.json'),
        elasticSearchEndpoint: 'domain',
        elasticSearchIndex: 'index',
        policyArn: 'arn::some-arn',
      },
      __dirname
    );

    // THEN
    expectCDK(stack).to(
      haveResource('AWS::Lambda::Function', { Handler: 'handler.handler' })
    );
  });
});
