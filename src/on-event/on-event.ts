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
  bucketParams: S3.GetObjectRequest
): Promise<string> => {
  const s3ObjectResponse = await s3.getObject(bucketParams).promise();
  const mapping = JSON.parse((s3ObjectResponse.Body as Buffer).toString());
  return mapping;
};

const checkClusterHealth = async (es: Client, maxRetries = 10) => {
  const response = await es.cluster.health(
    { wait_for_status: 'yellow', timeout: '60s' },
    { maxRetries }
  );
  if (response.body.timed_out) {
    throw new TimeoutError();
  }
};

const createIndexFromMapping = async (
  es: Client,
  indexNamePrefix: string,
  mapping: string
): Promise<string> => {
  const indexName = `${indexNamePrefix}-${randomBytes(16).toString('hex')}`;
  await es.indices.create(
    { index: indexName, body: mapping },
    { requestTimeout: 120 * 1000, maxRetries: 0 }
  );
  return indexName;
};

export const createHandler = (
  s3: S3,
  es: Client,
  bucketParams: S3.GetObjectRequest,
  indexNamePrefix: string,
  logger: { log: (...value: unknown[]) => void } = { log: () => {} },
  maxHealthRetries?: number
): OnEventHandler => {
  return async (event: OnEventRequest): Promise<OnEventResponse> => {
    const log = logger.log;
    log('Received event:', event);

    if (['Create', 'Update'].includes(event.RequestType)) {
      const mapping = await getMappingFromBucket(s3, bucketParams);
      log('Downloaded mapping from S3:', mapping);
      await checkClusterHealth(es, maxHealthRetries);
      log('Attempting to create index..');
      const indexName = await createIndexFromMapping(
        es,
        indexNamePrefix,
        mapping
      );
      log(`Created index ${indexName}`);

      return {
        PhysicalResourceId: indexName,
        Data: { [INDEX_NAME_KEY]: indexName },
      };
    }

    if (event.RequestType === 'Delete') {
      if (event.PhysicalResourceId == null) {
        throw new Error('event.PhysicalResourceId is required');
      }
      const currentIndexName: string = event.PhysicalResourceId;
      log(`Deleting older index: ${currentIndexName}`);
      const response = await es.indices.delete(
        { index: currentIndexName },
        { requestTimeout: 120 * 1000, maxRetries: 0 }
      );

      if (response.statusCode !== 200) {
        throw new Error();
      }

      return { PhysicalResourceId: currentIndexName };
    }

    return {};
  };
};
