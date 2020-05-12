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

const getMappingFromBucket = async (
  s3: S3,
  bucketParams: S3.GetObjectRequest,
  // tslint:disable-next-line:no-any
  logger: (...value: any) => void
): Promise<string> => {
  const s3ObjectResponse = await s3.getObject(bucketParams).promise();
  const mapping = JSON.parse((s3ObjectResponse.Body as Buffer).toString());
  logger('Downloaded mapping from S3:', mapping);
  return mapping;
};

const checkClusterHealth = async (
  es: Client,
  maxRetries = 10,
  // tslint:disable-next-line:no-any
  logger: (...value: any) => void
) => {
  logger('Waiting for cluster to become healthy');
  let retryHealth = maxRetries;
  while (retryHealth > 0) {
    const response = await es.cluster.health(
      {
        wait_for_status: 'yellow',
        timeout: '60s',
      },
      { maxRetries: 0 }
    );
    logger('received health response', response.body);
    if (response.body.timed_out) {
      retryHealth -= 1;
      if (retryHealth === 0) {
        throw new TimeoutError();
      }
    } else {
      retryHealth = 0;
    }
  }
};

export function createHandler(params: {
  s3: S3;
  es: Client;
  bucketParams: S3.GetObjectRequest;
  indexNamePrefix: string;
  // tslint:disable-next-line:no-any
  logger?: { log: (...value: any) => void };
  maxHealthRetries?: number;
}): OnEventHandler {
  return async (event: OnEventRequest): Promise<OnEventResponse> => {
    const mockLog = () => {};
    const log = params.logger?.log ?? mockLog;

    if (event.RequestType === 'Create') {
      const mapping = await getMappingFromBucket(
        params.s3,
        params.bucketParams,
        log
      );
      await checkClusterHealth(params.es, params.maxHealthRetries, log);

      const indexId = randomBytes(16).toString('hex');
      const indexName = `${params.indexNamePrefix}-${indexId}`;
      log(`Attempting to create index ${indexName}`);
      const response = await params.es.indices.create(
        {
          index: indexName,
          body: mapping,
        },
        { requestTimeout: 120 * 1000, maxRetries: 0 }
      );
      log('Response from create index:', response);

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
    bucketParams: {
      Bucket: process.env.S3_BUCKET_NAME as string,
      Key: process.env.S3_OBJECT_KEY as string,
    },
    indexNamePrefix: process.env.ELASTICSEARCH_INDEX as string,
    logger: console,
    maxHealthRetries: process.env.MAX_HEALTH_RETRIES
      ? Number(process.env.MAX_HEALTH_RETRIES)
      : undefined,
  })(event);

  console.log('response', response);
  return response;
};
