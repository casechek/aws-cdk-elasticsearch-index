import {
  IsCompleteHandler,
  IsCompleteRequest,
} from '@aws-cdk/custom-resources/lib/provider-framework/types';
import { Client } from '@elastic/elasticsearch';
import { createHandler } from '../../../src/is-complete/is-complete';

const mockEsTasks = jest.fn();
const esMock = {
  tasks: {
    get: mockEsTasks,
  },
};
jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn(() => esMock),
}));

describe('IsComplete Handler', () => {
  let handler: IsCompleteHandler;

  beforeEach(() => {
    handler = createHandler(new Client(), 'index');
  });

  afterEach(() => {
    mockEsTasks.mockReset();
  });

  it('confirms completion of task on update event', async () => {
    // GIVEN
    mockEsTasks.mockResolvedValueOnce({
      body: { completed: true },
    });

    // WHEN
    const result = await handler(({
      RequestType: 'Update',
      Data: {
        TaskId: 'task-id',
      },
    } as unknown) as IsCompleteRequest);

    // THEN
    expect(result).toEqual({ IsComplete: true });
  });

  it('returns IsComplete false when the task is not completed', async () => {
    // GIVEN
    mockEsTasks.mockResolvedValueOnce({
      body: { completed: false },
    });

    // WHEN
    const result = await handler(({
      RequestType: 'Update',
      Data: {
        TaskId: 'task-id',
      },
    } as unknown) as IsCompleteRequest);

    // THEN
    expect(mockEsTasks).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ IsComplete: false });
  });

  it('ignores event on anything other than update event', async () => {
    // WHEN
    const result = await handler(({
      RequestType: 'Not Update',
      Data: {
        TaskId: 'task-id',
      },
    } as unknown) as IsCompleteRequest);

    // THEN
    expect(mockEsTasks).toHaveBeenCalledTimes(0);
    expect(result).toEqual({ IsComplete: true });
  });
});
