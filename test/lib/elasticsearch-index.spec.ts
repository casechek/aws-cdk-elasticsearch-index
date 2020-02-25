import { expect as expectCDK, haveResource } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as path from 'path';
import { exec } from 'child_process';
import { existsSync } from 'fs';
import { ElasticsearchIndex } from '../../lib';

describe('Elasticsearch Index Custom Resource Stack', () => {
  it('Creates On Event Handler', async () => {
    // GIVEN
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'TestStack');

    // this is really an integration test, we need the file system for realz including the built lambda
    if (
      !existsSync(
        path.join(
          __dirname,
          '..',
          '..',
          'dist',
          'resources',
          'on-event',
          'on-event.js'
        )
      )
    ) {
      await new Promise((resolve, reject) => {
        exec(
          'npm run webpack',
          { cwd: path.join(__dirname, '..', '..') },
          error => {
            if (error) reject(error);
            resolve();
          }
        );
      });
    }

    // WHEN
    // tslint:disable-next-line:no-unused-expression
    new ElasticsearchIndex(stack, 'MyTestConstruct', {
      mappingJSONPath: path.join(__dirname, 'resources', 'mapping.json'),
      elasticSearchDomain: 'domain',
      elasticSearchIndex: 'index',
    });

    // THEN
    expectCDK(stack).to(
      haveResource('AWS::Lambda::Function', { Handler: 'on-event.handler' })
    );
  });
});
