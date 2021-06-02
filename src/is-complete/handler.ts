import { IsCompleteHandler } from '@aws-cdk/custom-resources/lib/provider-framework/types';
import { Client } from '@elastic/elasticsearch';
import { createHandler } from './is-complete';

/* istanbul ignore file */
const es = new Client({ node: process.env.ELASTICSEARCH_ENDPOINT });

export const handler: IsCompleteHandler = createHandler(
  es,
  process.env.ELASTICSEARCH_INDEX as string,
  console
);
