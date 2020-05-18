import { Before, Given, Then } from 'cucumber';
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

Given(
  /^an elasticsearch index named "([^"]*)" exists with mapping:$/,
  async (existingIndexName: string, mapping: string) => {
    await getESClient().indices.create({
      index: existingIndexName,
      body: mapping,
    });
  }
);

Given(
  /^an elasticsearch index named "([^"]*)" has this document indexed:$/,
  async (existingIndexName: string, mapping: string) => {
    await getESClient().index({
      index: existingIndexName,
      refresh: 'true',
      body: mapping,
    });
  }
);

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

Then(
  /^an elasticsearch index prefixed with "([^"]*)" does not exist$/,
  async (indexNameEnv: string) => {
    const indices = await getESClient().cat.indices();
    // tslint:disable-next-line:no-unused-expression
    expect(indices.body).to.not.contain(process.env[indexNameEnv]);
  }
);

Then(/^the elasticsearch index has mapping:$/, async (expected: string) => {
  const mapping = await getESClient().indices.getMapping({
    index: indexName as string,
  });

  expect(mapping.body[indexName].mappings).to.deep.equal(JSON.parse(expected));
});

Then(
  /^the elasticsearch index has this document indexed:$/,
  async (expected: string) => {
    const result = await getESClient().search({
      index: indexName as string,
      body: { query: { match: JSON.parse(expected) } },
    });

    expect(result.body.hits.total.value).to.equal(1);
  }
);
