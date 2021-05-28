import {
  IsCompleteHandler,
  IsCompleteRequest,
  IsCompleteResponse,
} from '@aws-cdk/custom-resources/lib/provider-framework/types';
import { Client } from '@elastic/elasticsearch';
import { TASK_ID_KEY } from '../constants';

export const createHandler = (
  es: Client,
  indexNamePrefix: string,
  logger: { log: (...value: unknown[]) => void } = { log: () => {} }
): IsCompleteHandler => {
  return async (event: IsCompleteRequest): Promise<IsCompleteResponse> => {
    logger.log('Received event:', event);
    if (event.RequestType === 'Update') {
      const response = await es.tasks.get({
        task_id: event.Data?.[TASK_ID_KEY],
      });
      if (response.body?.completed !== 'true') {
        logger.log('Reindex task not completed');
        return {
          Data: event.Data,
          IsComplete: false,
        };
      }
      logger.log('Reindex task completed');
    }
    return {
      Data: event.Data,
      IsComplete: true,
    };
  };
};
