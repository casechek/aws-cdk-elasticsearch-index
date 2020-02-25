import { Before, Then } from 'cucumber';
import { Client } from '@elastic/elasticsearch';
import { expect } from 'chai';

let esClient: Client;

function getESClient(): Client {
  if (esClient == null) {
    esClient = new Client({
      node: process.env.ELASTICSEARCH_DOMAIN,
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
  /^an elasticsearch index "([^"]*)" exists$/,
  async (indexNameEnv: string) => {
    const exists = await getESClient().indices.exists({
      index: process.env[indexNameEnv] as string,
    });

    // tslint:disable-next-line:no-unused-expression
    expect(exists.body).to.be.true;
    expect(exists.statusCode).to.be.equal(200);
  }
);

Then(
  /^an elasticsearch index "([^"]*)" has mapping:$/,
  async (indexNameEnv: string, expected: string) => {
    const mapping = await getESClient().indices.getMapping({
      index: process.env[indexNameEnv] as string,
    });

    expect(
      mapping.body[process.env[indexNameEnv] as string].mappings
    ).to.deep.equal(JSON.parse(expected));
  }
);
