import * as cdk from '@aws-cdk/core';
import { Duration } from '@aws-cdk/core';
import { Asset } from '@aws-cdk/aws-s3-assets';
import { IVpc } from '@aws-cdk/aws-ec2';
import { Code, Function, Runtime, Tracing } from '@aws-cdk/aws-lambda';
import { Provider } from '@aws-cdk/custom-resources';
import * as path from 'path';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { CustomResource } from '@aws-cdk/aws-cloudformation';
import { INDEX_NAME_KEY } from '../src/on-event/constants';

export interface ElasticsearchIndexProps {
  mappingJSONPath: string;
  elasticSearchIndex: string;
  elasticSearchEndpoint: string;
  vpc?: IVpc;
  policyArn?: string;
}

export class ElasticsearchIndex extends cdk.Construct {
  readonly indexName: string;
  constructor(
    scope: cdk.Construct,
    id: string,
    props: ElasticsearchIndexProps,
    onEventCodePath: string = path.join(
      __dirname,
      '..',
      'resources',
      'on-event'
    )
  ) {
    super(scope, id);

    const mappingJSONAsset = new Asset(this, 'IndexCreatorMappingJSON', {
      path: props.mappingJSONPath,
    });

    const onEventHandler = new Function(this, 'OnEventHandler', {
      runtime: Runtime.NODEJS_12_X,
      code: Code.fromAsset(onEventCodePath),
      handler: 'on-event.handler',
      environment: {
        ELASTICSEARCH_ENDPOINT: props.elasticSearchEndpoint,
        ELASTICSEARCH_INDEX: props.elasticSearchIndex,
        S3_BUCKET_NAME: mappingJSONAsset.s3BucketName,
        S3_OBJECT_KEY: mappingJSONAsset.s3ObjectKey,
        S3_URL: mappingJSONAsset.s3Url,
      },
      timeout: Duration.minutes(14),
      vpc: props.vpc,
      tracing: Tracing.ACTIVE,
    });

    mappingJSONAsset.grantRead(onEventHandler);

    if (props.policyArn) {
      onEventHandler.addToRolePolicy(
        new PolicyStatement({
          actions: ['es:ESHttpGet', 'es:ESHttpHead', 'es:ESHttpPut'],
          resources: [props.policyArn],
        })
      );
    }

    const provider = new Provider(this, 'ElasticsearchIndexProvider', {
      onEventHandler,
    });

    const resource = new CustomResource(this, 'ElasticsearchIndex', {
      provider,
    });

    this.indexName = resource.getAttString(INDEX_NAME_KEY);
  }
}
