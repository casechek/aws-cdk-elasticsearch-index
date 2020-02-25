import * as cdk from '@aws-cdk/core';
import { Duration } from '@aws-cdk/core';
import { Asset } from '@aws-cdk/aws-s3-assets';
import { IVpc } from '@aws-cdk/aws-ec2';
import { Code, Function, Runtime, Tracing } from '@aws-cdk/aws-lambda';
import { Provider } from '@aws-cdk/custom-resources';
import * as path from 'path';
import { PolicyStatement } from '@aws-cdk/aws-iam';
import { CustomResource } from '@aws-cdk/aws-cloudformation';

export interface ElasticsearchIndexProps {
  mappingJSONPath: string;
  elasticSearchIndex: string;
  elasticSearchDomain: string;
  vpc?: IVpc;
  policyArn?: string;
}

export class ElasticsearchIndex extends cdk.Construct {
  constructor(
    scope: cdk.Construct,
    id: string,
    props: ElasticsearchIndexProps
  ) {
    super(scope, id);

    const mappingJSONAsset = new Asset(this, 'IndexCreatorMappingJSON', {
      path: props.mappingJSONPath,
    });

    const onEventHandler = new Function(this, 'OnEventHandler', {
      runtime: Runtime.NODEJS_12_X,
      code: Code.fromAsset(
        path.join(__dirname, '..', 'dist', 'src', 'on-event')
      ),
      handler: 'on-event.handler',
      environment: {
        ELASTICSEARCH_DOMAIN: props.elasticSearchDomain,
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
  }
}
