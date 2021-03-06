import {
  OnEventRequest,
  OnEventHandler,
} from '@aws-cdk/custom-resources/lib/provider-framework/types';
import { S3 } from 'aws-sdk';
import { Client } from '@elastic/elasticsearch';
import { randomBytes } from 'crypto';
import { INDEX_NAME_KEY } from '../../../src/constants';

const cryptoToStringFn = jest.fn();

jest.mock('crypto', () => ({
  randomBytes: () => ({ toString: cryptoToStringFn }),
}));

const mockS3GetObject = jest.fn();
jest.mock('aws-sdk', () => ({
  S3: jest.fn(() => ({ getObject: mockS3GetObject })),
}));

const mockEsCreate = jest.fn();
const mockEsDelete = jest.fn();
const mockEsHealth = jest.fn();
const mockEsReIndex = jest.fn();
const esMock = {
  cluster: {
    health: mockEsHealth,
  },
  indices: {
    create: mockEsCreate,
    delete: mockEsDelete,
  },
  reindex: mockEsReIndex,
};
jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn(() => esMock),
}));
import { createHandler, TimeoutError } from '../../../src/on-event/on-event';

describe('OnEvent Handler', () => {
  let handler: OnEventHandler;

  beforeEach(() => {
    mockS3GetObject.mockReturnValue({
      promise: jest.fn().mockResolvedValue({ Body: Buffer.from('{}') }),
    });
    handler = createHandler(
      new S3(),
      new Client(),
      {
        Bucket: 'bucket',
        Key: 'key',
      },
      'index'
    );
  });

  afterEach(() => {
    mockEsCreate.mockReset();
    mockEsDelete.mockReset();
    mockEsHealth.mockReset();
    mockS3GetObject.mockReset();
  });

  it('creates index on create event', async () => {
    mockEsHealth.mockResolvedValueOnce({
      body: { timed_out: false },
    });
    mockEsCreate.mockResolvedValueOnce(true);
    cryptoToStringFn.mockReturnValue('random');

    // WHEN
    const result = await handler({
      RequestType: 'Create',
    } as OnEventRequest);

    // THEN
    expect(mockEsCreate).toHaveBeenCalledWith(
      {
        index: 'index-random',
        body: {},
      },
      { requestTimeout: 120 * 1000, maxRetries: 0 }
    );
    expect(result).toHaveProperty('PhysicalResourceId');
  });

  it('throws if never healthy', async () => {
    mockEsHealth.mockResolvedValueOnce({
      body: { timed_out: true },
    });

    await expect(
      handler({
        RequestType: 'Create',
      } as OnEventRequest)
    ).rejects.toThrow(TimeoutError);
  });

  it('returns index name on create', async () => {
    // GIVEN
    mockEsHealth.mockResolvedValueOnce({
      body: { timed_out: false },
    });
    mockEsCreate.mockResolvedValueOnce(true);

    // WHEN
    const result = await handler({
      RequestType: 'Create',
    } as OnEventRequest);

    // THEN
    expect(result?.Data?.[INDEX_NAME_KEY]).toContain('index-');
  });

  it('updates index on update event', async () => {
    mockEsHealth.mockResolvedValueOnce({
      body: { timed_out: false },
    });
    mockEsReIndex.mockResolvedValueOnce({
      body: { timed_out: false },
    });
    mockEsCreate.mockResolvedValueOnce(true);

    const indexPrefix = 'index';
    const oldId = randomBytes(16).toString('hex');
    const newId = randomBytes(16).toString('hex');

    cryptoToStringFn.mockReturnValue(newId);
    const oldIndex = `${indexPrefix}-${oldId}`;
    const newIndex = `${indexPrefix}-${newId}`;

    // WHEN
    const result = await handler(({
      RequestType: 'Update',
      PhysicalResourceId: oldId,
    } as unknown) as OnEventRequest);

    // THEN
    expect(mockEsCreate).toHaveBeenCalledWith(
      {
        index: newIndex,
        body: {},
      },
      { requestTimeout: 120 * 1000, maxRetries: 0 }
    );
    expect(mockEsReIndex).toHaveBeenCalledWith({
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
    expect(result).toHaveProperty('PhysicalResourceId');
  });

  it('throws if reindex request times out', async () => {
    mockEsHealth.mockResolvedValueOnce({
      body: { timed_out: false },
    });
    mockEsReIndex.mockResolvedValueOnce({
      body: { timed_out: true },
    });
    mockEsCreate.mockResolvedValueOnce(true);

    const oldId = randomBytes(16).toString('hex');
    cryptoToStringFn.mockReturnValue(oldId);
    await expect(
      handler({
        RequestType: 'Update',
        PhysicalResourceId: oldId,
      } as OnEventRequest)
    ).rejects.toThrow(TimeoutError);
  });

  it('throws when an Update request has no PhysicalResourceId ', async () => {
    // WHEN and THEN
    await expect(
      handler(({
        RequestType: 'Update',
      } as unknown) as OnEventRequest)
    ).rejects.toThrowError('event.PhysicalResourceId is required');
  });

  it('deletes index on delete event', async () => {
    mockEsDelete.mockResolvedValueOnce({ statusCode: 200 });

    const indexPrefix = 'index';
    const oldId = randomBytes(16).toString('hex');
    const oldIndex = `${indexPrefix}-${oldId}`;

    // WHEN
    const result = await handler(({
      RequestType: 'Delete',
      PhysicalResourceId: oldId,
    } as unknown) as OnEventRequest);

    // THEN
    expect(mockEsDelete).toHaveBeenCalledWith(
      { index: oldIndex },
      { requestTimeout: 120 * 1000, maxRetries: 0 }
    );
  });

  it('tries to delete an non-existent index', async () => {
    mockEsDelete.mockResolvedValueOnce({ statusCode: 404 });

    const indexPrefix = 'index';
    const oldId = randomBytes(16).toString('hex');
    const oldIndex = `${indexPrefix}-${oldId}`;
    // WHEN
    await expect(
      handler(({
        RequestType: 'Delete',
        PhysicalResourceId: oldId,
      } as unknown) as OnEventRequest)
    ).rejects.toThrowError('Error when deleting the older index.');

    // THEN
    expect(mockEsDelete).toHaveBeenCalledWith(
      { index: oldIndex },
      { requestTimeout: 120 * 1000, maxRetries: 0 }
    );
  });

  it('throws when a Delete request has no PhysicalResourceId ', async () => {
    // WHEN and THEN
    await expect(
      handler(({
        RequestType: 'Delete',
      } as unknown) as OnEventRequest)
    ).rejects.toThrowError('event.PhysicalResourceId is required');
  });

  it('throws when a request is not an expected type', async () => {
    // WHEN and THEN
    await expect(
      handler(({
        RequestType: 'Other',
      } as unknown) as OnEventRequest)
    ).rejects.toThrowError('Unknown Request Type');
  });
});
