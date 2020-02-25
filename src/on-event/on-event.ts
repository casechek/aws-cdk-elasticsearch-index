import {
  OnEventHandler,
  OnEventRequest,
  OnEventResponse,
} from '@aws-cdk/custom-resources/lib/provider-framework/types';
import { Client } from '@elastic/elasticsearch';
import { S3 } from 'aws-sdk';
import { randomBytes } from 'crypto';
import { INDEX_NAME_KEY } from './constants';

export class TimeoutError extends Error {}

export function createHandler(params: {
  s3: S3;
  es: Client;
  bucketName: string;
  objectKey: string;
  indexName: string;
  // tslint:disable-next-line:no-any
  logger?: { log: (...value: any) => void };
  maxHealthRetries?: number;
}): OnEventHandler {
  return async (event: OnEventRequest): Promise<OnEventResponse> => {
    const mockLog = () => {};
    const log = params.logger?.log ?? mockLog; // two lines because PhpStorm doesn't quite handle ?? correctly in the case of a function as value

    if (event.RequestType === 'Create') {
      log(event);
      const s3ObjectResponse = await params.s3
        .getObject({
          Bucket: params.bucketName,
          Key: params.objectKey,
        })
        .promise();

      const mapping = JSON.parse((s3ObjectResponse.Body as Buffer).toString());
      log('downloaded s3 object', mapping);

      log('waiting for cluster to become healthy');
      let retryHealth = params.maxHealthRetries ?? 10;
      while (retryHealth > 0) {
        const response = await params.es.cluster.health(
          {
            wait_for_status: 'yellow',
            timeout: '60s',
          },
          { maxRetries: 0 }
        );
        log('received health response', response.body);
        if (response.body.timed_out) {
          retryHealth -= 1;
          if (retryHealth === 0) {
            throw new TimeoutError();
          }
        } else {
          retryHealth = 0;
        }
      }

      log(`attempting to create index ${params.indexName}`);
      const indexId = randomBytes(16).toString('hex');
      const indexName = `${params.indexName}-${indexId}`;
      const response = await params.es.indices.create(
        {
          index: params.indexName,
          body: mapping,
        },
        { requestTimeout: 120 * 1000, maxRetries: 0 }
      );

      log('response from create index', response);
      return {
        PhysicalResourceId: indexId,
        Data: {
          [INDEX_NAME_KEY]: indexName,
        },
      };
    }

    return {};
  };
}

/* istanbul ignore next */
export const handler = async (
  event: OnEventRequest
): Promise<OnEventResponse | undefined> => {
  const s3 = new S3({
    endpoint: process.env.S3_ENDPOINT,
    s3ForcePathStyle: true,
  });

  const es = new Client({ node: process.env.ELASTICSEARCH_ENDPOINT });

  const response = await createHandler({
    s3,
    es,
    bucketName: process.env.S3_BUCKET_NAME as string,
    objectKey: process.env.S3_OBJECT_KEY as string,
    indexName: process.env.ELASTICSEARCH_INDEX as string,
    logger: console,
    maxHealthRetries: process.env.MAX_HEALTH_RETRIES
      ? Number(process.env.MAX_HEALTH_RETRIES)
      : undefined,
  })(event);

  console.log('response', response);
  return response;
};
