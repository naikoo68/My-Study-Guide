import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Agent as HttpsAgent } from "https";
import { Agent as HttpAgent } from "http";

// ---------------------------------------------------------------------------
// DynamoDB connection.
//
// Works against real AWS DynamoDB *and* a local DynamoDB (DynamoDB Local /
// LocalStack) so you can develop offline.
//
//   AWS_REGION            – AWS region (default "us-east-1")
//   DYNAMODB_ENDPOINT     – set to e.g. http://localhost:8000 to use DynamoDB
//                           Local. When set, dummy credentials are used so you
//                           don't need real AWS keys for local development.
//   AWS_ACCESS_KEY_ID /
//   AWS_SECRET_ACCESS_KEY – standard AWS credentials (only needed against real
//                           AWS; the default provider chain / IAM role is also
//                           honoured when these are absent).
//   DYNAMODB_TABLE_PREFIX – prefix for every table name (default "msg_"), so
//                           several environments can share one account.
// ---------------------------------------------------------------------------

export const REGION = process.env.AWS_REGION || "us-east-1";
export const ENDPOINT = process.env.DYNAMODB_ENDPOINT || undefined;
export const TABLE_PREFIX = process.env.DYNAMODB_TABLE_PREFIX || "msg_";

// Full table name for a given logical collection name.
export const tableName = (collection) => `${TABLE_PREFIX}${collection}`;

// Max concurrent HTTP connections the SDK may open to DynamoDB. The AWS SDK's
// default NodeHttpHandler caps this at 50, which is far too low here: the app
// emulates Mongo-style count/aggregate by SCANNING whole tables (many parallel
// GetItem/Query/Scan calls), and the one-time Mongo→Dynamo migration fires a
// large burst of writes. Together they exhaust 50 sockets, so requests queue up
// ("socket usage at capacity=50 and N additional requests are enqueued") and
// everything crawls. Raising the ceiling + keep-alive (reuse warm TLS sockets)
// removes that bottleneck. Tune via DYNAMODB_MAX_SOCKETS.
const MAX_SOCKETS = Number(process.env.DYNAMODB_MAX_SOCKETS) || 256;
const requestHandler = new NodeHttpHandler({
  httpsAgent: new HttpsAgent({ keepAlive: true, maxSockets: MAX_SOCKETS }),
  httpAgent: new HttpAgent({ keepAlive: true, maxSockets: MAX_SOCKETS }),
});

function buildClient() {
  const config = { region: REGION, requestHandler };
  if (ENDPOINT) {
    // Local mode — point at the local endpoint and use throw-away credentials
    // (DynamoDB Local ignores them but the SDK still requires *some* value).
    config.endpoint = ENDPOINT;
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "local",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "local",
    };
  } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    // Explicit credentials from the environment.
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      ...(process.env.AWS_SESSION_TOKEN ? { sessionToken: process.env.AWS_SESSION_TOKEN } : {}),
    };
  }
  // Otherwise fall back to the default AWS provider chain (IAM role, shared
  // credentials file, SSO, etc.).
  return new DynamoDBClient(config);
}

export const rawClient = buildClient();

// DocumentClient handles JS <-> DynamoDB attribute-value marshalling for us.
export const ddb = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: {
    // Drop `undefined` values instead of erroring (Mongoose simply omits them).
    removeUndefinedValues: true,
    // Convert class instances (our Documents) to plain maps when writing.
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    // Keep large numbers as JS numbers (all our numeric fields are small).
    wrapNumbers: false,
  },
});

export function isLocal() {
  return Boolean(ENDPOINT);
}
