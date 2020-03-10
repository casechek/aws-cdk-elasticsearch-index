import { Before, Then } from 'cucumber';
import { Client } from '@elastic/elasticsearch';
import { expect } from 'chai';

let esClient: Client;
let indexName: string;

function getESClient(): Client {
  if (esClient == null) {
    esClient = new Client({
      node: process.env.ELASTICSEARCH_ENDPOINT,
    });
  }

  return esClient;
}

Before({ tags: '@clearElasticSearch' }, async () => {
  const indices = await getESClient().cat.indices({});
  const rows = indices.body.split(/\n/);
  for (const row of rows) {
    const index = row.split(/\s+/)[2];
    if (index && index.charAt(0) !== '.') {
      await getESClient().indices.delete({ index });
    }
  }
});

Then(
  /^an elasticsearch index prefixed with "([^"]*)" exists$/,
  async (indexNameEnv: string) => {
    const indices = await getESClient().cat.indices();

    // tslint:disable-next-line:no-unused-expression
    expect(indices.body).to.contain(process.env[indexNameEnv]);
    expect(indices.statusCode).to.be.equal(200);

    // @todo this regex should stop at the first whitespace but does not in javascript
    const matches = (indices.body as string).match(
      new RegExp(`${process.env[indexNameEnv]}[^ ]*`, 'gm')
    );
    if (matches && matches.length === 1) {
      indexName = matches[0];
    }
    // tslint:disable-next-line:no-unused-expression
    expect(indexName).to.not.be.empty;
  }
);

Then(/^the elasticsearch index has mapping:$/, async (expected: string) => {
  const mapping = await getESClient().indices.getMapping({
    index: indexName as string,
  });

  expect(mapping.body[indexName].mappings).to.deep.equal(JSON.parse(expected));
});
