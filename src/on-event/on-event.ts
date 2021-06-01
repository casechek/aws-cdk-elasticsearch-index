import {
  OnEventHandler,
  OnEventRequest,
  OnEventResponse,
} from '@aws-cdk/custom-resources/lib/provider-framework/types';
import { Client } from '@elastic/elasticsearch';
import { S3 } from 'aws-sdk';
import { randomBytes } from 'crypto';
import { INDEX_NAME_KEY, OLD_INDEX_NAME_KEY, TASK_ID_KEY } from '../constants';

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
): Promise<{ indexId: string; indexName: string }> => {
  const indexId = randomBytes(16).toString('hex');
  const indexName = `${indexNamePrefix}-${indexId}`;
  await es.indices.create(
    { index: indexName, body: mapping },
    { requestTimeout: 120 * 1000, maxRetries: 0 }
  );
  return { indexId, indexName };
};

const reIndexAllDocuments = async (
  es: Client,
  oldIndex: string,
  newIndex: string
): Promise<string | undefined> => {
  const response = await es.reindex({
    wait_for_completion: false,
    refresh: true,
    body: {
      source: {
        index: oldIndex,
      },
      dest: {
        index: newIndex,
      },
    },
  });
  if (response.body.timed_out) {
    throw new TimeoutError();
  }
  return response.body?.task;
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

    if (event.RequestType === 'Create') {
      const mapping = await getMappingFromBucket(s3, bucketParams);
      log('Downloaded mapping from S3:', mapping);
      await checkClusterHealth(es, maxHealthRetries);
      log('Attempting to create index..');
      const { indexName, indexId } = await createIndexFromMapping(
        es,
        indexNamePrefix,
        mapping
      );
      log(`Created index ${indexName}`);

      return {
        PhysicalResourceId: indexId,
        Data: { [INDEX_NAME_KEY]: indexName },
      };
    } else if (event.RequestType === 'Update') {
      if (event.PhysicalResourceId == null) {
        throw new Error('event.PhysicalResourceId is required');
      }
      const mapping = await getMappingFromBucket(s3, bucketParams);
      log('Downloaded mapping from S3:', mapping);
      await checkClusterHealth(es, maxHealthRetries);
      log('Attempting to create index..');
      const oldIndexName = `${indexNamePrefix}-${event.PhysicalResourceId as string}`;
      const { indexName, indexId } = await createIndexFromMapping(
        es,
        indexNamePrefix,
        mapping
      );
      log(`Created index ${indexName}, reindexing from ${oldIndexName}..`);
      const taskId = await reIndexAllDocuments(es, oldIndexName, indexName);
      log(`Reindex task id is ${taskId}`);
      return {
        PhysicalResourceId: indexId,
        Data: {
          [INDEX_NAME_KEY]: indexName,
          ...(taskId !== undefined
            ? { [OLD_INDEX_NAME_KEY]: oldIndexName, [TASK_ID_KEY]: taskId }
            : {}),
        },
      };
    } else if (event.RequestType === 'Delete') {
      if (event.PhysicalResourceId == null) {
        throw new Error('event.PhysicalResourceId is required');
      }
      const currentIndexName = `${indexNamePrefix}-${event.PhysicalResourceId as string}`;
      log(`Deleting older index: ${currentIndexName}`);
      const response = await es.indices.delete(
        { index: currentIndexName },
        { requestTimeout: 120 * 1000, maxRetries: 0 }
      );

      if (response.statusCode !== 200) {
        throw new Error('Error when deleting the older index.');
      }

      return { PhysicalResourceId: event.PhysicalResourceId };
    }

    throw new Error('Unknown Request Type');
  };
};
