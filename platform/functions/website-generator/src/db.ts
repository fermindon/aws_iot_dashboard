// ── DynamoDB helpers for job & website status ────────
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { Website } from './types';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const JOBS_TABLE = process.env.JOBS_TABLE || '';
const WEBSITES_TABLE = process.env.WEBSITES_TABLE || '';

/** Update a generation job's status and optional extra fields. */
export async function updateJob(
  jobId: string,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  let updateExpr = 'SET #s = :s, #u = :u';
  const values: Record<string, unknown> = {
    ':s': status,
    ':u': Date.now(),
  };
  const names: Record<string, string> = {
    '#s': 'status',
    '#u': 'updatedAt',
  };

  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      updateExpr += `, #${k} = :${k}`;
      values[`:${k}`] = v;
      names[`#${k}`] = k;
    }
  }

  await ddb.send(
    new UpdateCommand({
      TableName: JOBS_TABLE,
      Key: { jobId },
      UpdateExpression: updateExpr,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
    }),
  );
}

/** Update a website's status (and optional liveUrl). */
export async function updateWebsiteStatus(
  customerId: string,
  websiteId: string,
  status: string,
  liveUrl?: string,
): Promise<void> {
  let updateExpr = 'SET #s = :s, #u = :u';
  const values: Record<string, unknown> = {
    ':s': status,
    ':u': Date.now(),
  };
  const names: Record<string, string> = {
    '#s': 'status',
    '#u': 'updatedAt',
  };

  if (liveUrl) {
    updateExpr += ', #lu = :lu';
    values[':lu'] = liveUrl;
    names['#lu'] = 'liveUrl';
  }

  await ddb.send(
    new UpdateCommand({
      TableName: WEBSITES_TABLE,
      Key: { customerId, websiteId },
      UpdateExpression: updateExpr,
      ExpressionAttributeValues: values,
      ExpressionAttributeNames: names,
    }),
  );
}

/** Fetch the latest website record from DynamoDB by websiteId (via GSI). */
export async function fetchWebsite(websiteId: string): Promise<Website | null> {
  const resp = await ddb.send(
    new QueryCommand({
      TableName: WEBSITES_TABLE,
      IndexName: 'websiteId-index',
      KeyConditionExpression: 'websiteId = :wid',
      ExpressionAttributeValues: { ':wid': websiteId },
    }),
  );
  const items = resp.Items || [];
  return items.length ? (items[0] as Website) : null;
}

/** Store generated content back on the website record. */
export async function saveGeneratedContent(
  customerId: string,
  websiteId: string,
  content: Record<string, unknown>,
): Promise<void> {
  await ddb.send(
    new UpdateCommand({
      TableName: WEBSITES_TABLE,
      Key: { customerId, websiteId },
      UpdateExpression: 'SET content = :c',
      ExpressionAttributeValues: { ':c': content },
    }),
  );
}
