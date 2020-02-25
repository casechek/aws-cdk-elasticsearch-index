import { createHandler, TimeoutError } from '../../../src/on-event/on-event';
import { OnEventRequest } from '@aws-cdk/custom-resources/lib/provider-framework/types';
import { S3 } from 'aws-sdk';
import { Client } from '@elastic/elasticsearch';
import { INDEX_NAME_KEY } from '../../../src/on-event/constants';

jest.mock('aws-sdk');
jest.mock('@elastic/elasticsearch');

describe('OnEvent Handler', () => {
  let s3: S3;
  let es: Client;

  beforeEach(() => {
    s3 = new S3();
    s3.getObject = jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({ Body: Buffer.from('{}') }),
    });
    es = new Client();
  });

  it('creates index on create event', async () => {
    es.cluster = {
      health: jest
        .fn()
        .mockImplementation()
        .mockResolvedValueOnce({
          body: {
            timed_out: true,
          },
        })
        .mockResolvedValueOnce({
          body: {
            timed_out: false,
          },
        }),
      // tslint:disable-next-line:no-any
    } as any;

    es.indices = {
      create: jest
        .fn()
        .mockImplementation()
        .mockResolvedValue(true),
      // tslint:disable-next-line:no-any
    } as any;

    const handler = createHandler({
      s3,
      es,
      bucketName: 'bucket',
      objectKey: 'key',
      indexName: 'index',
    });

    // WHEN
    const result = await handler({
      RequestType: 'Create',
    } as OnEventRequest);

    // THEN
    expect(es.indices.create).toHaveBeenCalledWith(
      {
        index: 'index',
        body: {},
      },
      { requestTimeout: 120 * 1000, maxRetries: 0 }
    );
    expect(result).toHaveProperty('PhysicalResourceId');
  });

  it('throws if never healthy', async () => {
    es.cluster = {
      health: jest
        .fn()
        .mockImplementation()
        .mockResolvedValue({
          body: {
            timed_out: true,
          },
        }),
      // tslint:disable-next-line:no-any
    } as any;

    const handler = createHandler({
      s3,
      es,
      bucketName: 'bucket',
      objectKey: 'key',
      indexName: 'index',
      maxHealthRetries: 2,
    });

    await expect(
      handler({
        RequestType: 'Create',
      } as OnEventRequest)
    ).rejects.toThrow(TimeoutError);
  });

  it('returns index name on create', async () => {
    // GIVEN
    es.cluster = {
      health: jest
        .fn()
        .mockImplementation()
        .mockResolvedValue({
          body: {
            timed_out: false,
          },
        }),
      // tslint:disable-next-line:no-any
    } as any;

    es.indices = {
      create: jest
        .fn()
        .mockImplementation()
        .mockResolvedValue(true),
      // tslint:disable-next-line:no-any
    } as any;

    const handler = createHandler({
      s3,
      es,
      bucketName: 'bucket',
      objectKey: 'key',
      indexName: 'index',
    });

    // WHEN
    const result = await handler({
      RequestType: 'Create',
    } as OnEventRequest);

    // THEN
    expect(result?.Data?.[INDEX_NAME_KEY]).toContain('index-');
  });
});
