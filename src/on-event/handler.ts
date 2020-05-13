import { OnEventHandler } from '@aws-cdk/custom-resources/lib/provider-framework/types';
import { Client } from '@elastic/elasticsearch';
import { S3 } from 'aws-sdk';
import { createHandler } from './on-event';

/* istanbul ignore file */
const s3 = new S3({
  endpoint: process.env.S3_ENDPOINT,
  s3ForcePathStyle: true,
});
const es = new Client({ node: process.env.ELASTICSEARCH_ENDPOINT });

export const handler: OnEventHandler = createHandler(
  s3,
  es,
  {
    Bucket: process.env.S3_BUCKET_NAME as string,
    Key: process.env.S3_OBJECT_KEY as string,
  },
  process.env.ELASTICSEARCH_INDEX as string,
  console,
  process.env.MAX_HEALTH_RETRIES
    ? Number(process.env.MAX_HEALTH_RETRIES)
    : undefined
);
