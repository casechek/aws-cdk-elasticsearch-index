import { createHandler, TimeoutError } from '../../../src/on-event/on-event';
import {
  OnEventRequest,
  OnEventHandler,
} from '@aws-cdk/custom-resources/lib/provider-framework/types';
import { S3 } from 'aws-sdk';
import { Client } from '@elastic/elasticsearch';
import { INDEX_NAME_KEY } from '../../../src/on-event/constants';

jest.mock('aws-sdk');
jest.mock('@elastic/elasticsearch');

const cryptoToStringFn = jest.fn();

jest.mock('crypto', () => ({
  randomBytes: () => ({ toString: cryptoToStringFn }),
}));

describe('OnEvent Handler', () => {
  let s3: S3;
  let es: Client;
  let handler: OnEventHandler;

  beforeEach(() => {
    s3 = new S3();
    s3.getObject = jest.fn().mockReturnValue({
      promise: jest.fn().mockResolvedValue({ Body: Buffer.from('{}') }),
    });
    es = new Client();
    handler = createHandler({
      s3,
      es,
      bucketParams: {
        Bucket: 'bucket',
        Key: 'key',
      },
      indexNamePrefix: 'index',
    });
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

    cryptoToStringFn.mockReturnValue('random');

    // WHEN
    const result = await handler({
      RequestType: 'Create',
    } as OnEventRequest);

    // THEN
    expect(es.indices.create).toHaveBeenCalledWith(
      {
        index: 'index-random',
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

    handler = createHandler({
      s3,
      es,
      bucketParams: {
        Bucket: 'bucket',
        Key: 'key',
      },
      indexNamePrefix: 'index',
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

    // WHEN
    const result = await handler({
      RequestType: 'Create',
    } as OnEventRequest);

    // THEN
    expect(result?.Data?.[INDEX_NAME_KEY]).toContain('index-');
  });

  it('deletes index on delete event', async () => {
    es.indices = {
      delete: jest
        .fn()
        .mockImplementation()
        .mockResolvedValue({ statusCode: 200 }),
      // tslint:disable-next-line:no-any
    } as any;

    // WHEN
    const result = await handler(({
      RequestType: 'Delete',
      ResourceProperties: {
        IndexName: 'existing-index',
      },
    } as unknown) as OnEventRequest);

    // THEN
    expect(es.indices.delete).toHaveBeenCalledWith(
      {
        index: 'existing-index',
      },
      { requestTimeout: 120 * 1000, maxRetries: 0 }
    );
  });

  it('tries to delete an non-existent index', async () => {
    es.indices = {
      delete: jest
        .fn()
        .mockImplementation()
        .mockResolvedValue({ statusCode: 404 }),
      // tslint:disable-next-line:no-any
    } as any;

    // WHEN
    await expect(
      handler(({
        RequestType: 'Delete',
        ResourceProperties: {
          IndexName: 'existing-index',
        },
      } as unknown) as OnEventRequest)
    ).rejects.toThrow(Error);

    // THEN
    expect(es.indices.delete).toHaveBeenCalledWith(
      {
        index: 'existing-index',
      },
      { requestTimeout: 120 * 1000, maxRetries: 0 }
    );
  });
});
