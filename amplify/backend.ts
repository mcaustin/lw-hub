// External dependencies
import { defineBackend } from "@aws-amplify/backend";
import * as YAML from "yaml";
import * as cdk from "aws-cdk-lib";
import { RemovalPolicy, Stack } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import { LogGroup } from "aws-cdk-lib/aws-logs";
import * as osis from "aws-cdk-lib/aws-osis";
import * as oss from "aws-cdk-lib/aws-opensearchserverless";
import { auth } from "./auth/resource";
import { data } from "./data/resource";
import { storage } from "./storage/resource";

const backend = defineBackend({
  auth,
  data,
  storage,
});

const openSearchStack = Stack.of(backend.data);
const region = openSearchStack.region;
const collectionName = "dynamodb-etl-collection";
const tableName = backend.data.resources.tables["Movie"].tableName;
const tableArn = backend.data.resources.tables["Movie"].tableArn;
const s3BucketArn = backend.storage.resources.bucket.bucketArn;

// Get reference to the Movie table from Amplify resources
const movieTable =
  backend.data.resources.cfnResources.amplifyDynamoDbTables["Movie"];

//Enable Point-in-Time Recovery (PITR)
movieTable.pointInTimeRecoveryEnabled = true;
//Configure DynamoDB Streams
movieTable.streamSpecification = {
  streamViewType: dynamodb.StreamViewType.NEW_IMAGE,
};

/**
 * Create Encryption Policy for OpenSearch Serverless
 * This policy defines how data is encrypted at rest within the collection
 */
const encryptionPolicy = new oss.CfnSecurityPolicy(
  openSearchStack,
  "EncryptionPolicy",
  {
    // Unique identifier for the encryption policy
    name: "ddb-etl-encryption-serverless",

    // Policy type - 'encryption' handles data encryption at rest
    type: "encryption",

    // Human-readable description for the policy
    description: `Encryption policy for ${collectionName} collection`,

    // Policy configuration
    policy: JSON.stringify({
      Rules: [
        {
          // Specify resource type this encryption applies to
          ResourceType: "collection",

          // Define which collections this policy affects
          // Wildcard (*) ensures policy applies to all indices within collection
          Resource: [`collection/${collectionName}*`],
        },
      ],
      // Use AWS owned KMS key for encryption
      // Alternative: Set to false and specify 'KmsKeyId' for customer managed key
      AWSOwnedKey: true,

      /* Example of customer managed key configuration:
      AWSOwnedKey: false,
      KmsKeyId: 'arn:aws:kms:region:account:key/key-id'
      */
    }),
  }
);

/**
 * Create Network Policy for OpenSearch Serverless
 * This policy controls network access to the OpenSearch collection
 */
const networkPolicy = new oss.CfnSecurityPolicy(
  openSearchStack,
  "NetworkPolicy",
  {
    // Unique identifier for the network policy
    name: "ddb-etl-network-serverless",

    // Policy type - 'network' controls access patterns
    type: "network",

    // Human-readable description for the policy
    description: `Network policy for ${collectionName} collection`,

    // Network access rules
    policy: JSON.stringify([
      {
        Rules: [
          {
            // Specify resource type this network policy applies to
            ResourceType: "collection",

            // Define which collections this policy affects
            Resource: [`collection/${collectionName}`],
          },
        ],
        // Allow public access to the collection
        // WARNING: For production, consider restricting access:
        // - Use VPC endpoints
        // - Specify IP ranges
        // - Configure VPC security groups
        AllowFromPublic: true,

      },
    ]),
  }
);

// Create OpenSearch Serverless Collection
const openSearchServerlessCollection = new oss.CfnCollection(
  openSearchStack,
  "OpenSearchServerlessCollection1",
  {
    name: collectionName,
    description: "DynamoDB to OpenSearch Pipeline ETL Integration",
    type: "SEARCH",
  }
);
// set removalPolicy to DESTROY to make sure the OpenSearch collection is deleted on stack deletion.
openSearchServerlessCollection.applyRemovalPolicy(RemovalPolicy.DESTROY);
// Add policy dependencies
openSearchServerlessCollection.addDependency(encryptionPolicy);
openSearchServerlessCollection.addDependency(networkPolicy);

/**
 * Create OpenSearch Serverless Data Source
 * This configures the OpenSearch endpoint as an HTTP data source for API operations
 */
const openSearchDataSource = backend.data.addHttpDataSource(
  "OpenSearchServerlessDataSource",
  openSearchServerlessCollection.attrCollectionEndpoint,
  {
    authorizationConfig: {
      // Region where the OpenSearch collection exists
      signingRegion: region,

      // Service name for request signing (aoss = Amazon OpenSearch Serverless)
      signingServiceName: "aoss",
    },
  }
);

/**
 * Configure Data Source IAM Permissions
 * Grants necessary permissions for OpenSearch operations using IAM policies
 */
openSearchDataSource.grantPrincipal.addToPrincipalPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: ["aoss:APIAccessAll"],
    resources: [
      // Grant access to the specific collection
      openSearchServerlessCollection.attrArn,
      // Grant access to all indices within the collection
      `${openSearchServerlessCollection.attrArn}/*`,
    ],
  })
);

/**
 * Get data source role information
 */
const httpDataSourceRole = openSearchDataSource.grantPrincipal as iam.Role;
const httpDataSourceRoleArn = httpDataSourceRole.roleArn;

/**
 * Policy for DynamoDB export operations
 * Allows:
 * - Describing table configuration
 * - Checking backup capabilities
 * - Initiating table exports
 */
const dynamoDBExportJobPolicy = new iam.PolicyStatement({
  sid: "allowRunExportJob",
  effect: iam.Effect.ALLOW,
  actions: [
    // Required for getting table metadata before export
    "dynamodb:DescribeTable",
    // Required for verifying point-in-time recovery status
    "dynamodb:DescribeContinuousBackups",
    // Required for initiating table export operation
    "dynamodb:ExportTableToPointInTime",
  ],
  resources: [tableArn],
});

/**
 * Policy for monitoring export job status
 * Allows:
 * - Checking status of ongoing export operations
 * - Monitoring export progress
 * Note: Uses wildcard for export operations as export IDs are dynamically generated
 */
const dynamoDBExportCheckPolicy = new iam.PolicyStatement({
  sid: "allowCheckExportjob",
  effect: iam.Effect.ALLOW,
  actions: ["dynamodb:DescribeExport"],
  resources: [`${tableArn}/export/*`],
});

/**
 * Policy for DynamoDB Stream operations
 * Allows:
 * - Reading stream metadata
 * - Accessing stream records
 * - Managing stream iterators
 * Required for real-time data synchronization
 */
const dynamoDBStreamPolicy = new iam.PolicyStatement({
  sid: "allowReadFromStream",
  effect: iam.Effect.ALLOW,
  actions: [
    // Required for getting stream metadata
    "dynamodb:DescribeStream",
    // Required for reading actual records from the stream
    "dynamodb:GetRecords",
    // Required for managing stream position
    "dynamodb:GetShardIterator",
  ],
  resources: [`${tableArn}/stream/*`],
});

/**
 * Policy for S3 operations during export
 * Allows:
 * - Reading exported data
 * - Writing export files
 * - Managing multipart uploads
 * - Setting object ACLs
 * Scoped to specific export path for security
 */
const s3ExportPolicy = new iam.PolicyStatement({
  sid: "allowReadAndWriteToS3ForExport",
  effect: iam.Effect.ALLOW,
  actions: [
    // Required for reading exported data
    "s3:GetObject",
    // Required for handling failed uploads
    "s3:AbortMultipartUpload",
    // Required for writing export files
    "s3:PutObject",
    // Required for setting object permissions
    "s3:PutObjectAcl",
  ],
  resources: [`${s3BucketArn}`, `${s3BucketArn}/${tableName}/*`],
});

/**
 * Policy for OpenSearch domain access
 * Allows:
 * - HTTP operations for indexing and querying
 * - Domain management operations
 * Includes permissions for both domain-level and index-level operations
 */
const openSearchCollectionPolicy = new iam.PolicyStatement({
  sid: "allowOpenSearchAccess",
  effect: iam.Effect.ALLOW,
  actions: [
    // Allows batch retrieval of collection information
    "aoss:BatchGetCollection",
    // Required for search, index, and administrative operations
    "aoss:APIAccessAll",
    // Needed for encryption and network policy validation
    "aoss:GetSecurityPolicy",
    // Required for initial setup and scaling operations
    "aoss:CreateCollection",
    // Needed for collection discovery and management
    "aoss:ListCollections",
    // Required for updating collection settings and configurations
    "aoss:UpdateCollection",
    // Needed for cleanup and resource management
    "aoss:DeleteCollection",
  ],

  resources: [
    openSearchServerlessCollection.attrArn,
    //`${openSearchServerlessCollection.attrArn}/*`,
    //`arn:aws:aoss:${region}:${openSearchStack.account}:collection/*`,
  ],
});

// Create base role with OpenSearch Ingestion managed policy
const openSearchIntegrationPipelineRole = new iam.Role(
  openSearchStack,
  "OpenSearchIntegrationPipelineRole2",
  {
    assumedBy: new iam.ServicePrincipal("osis-pipelines.amazonaws.com"),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonOpenSearchIngestionFullAccess"
      ),
    ],
  }
);

openSearchIntegrationPipelineRole.addToPolicy(dynamoDBExportJobPolicy);
openSearchIntegrationPipelineRole.addToPolicy(dynamoDBExportCheckPolicy);
openSearchIntegrationPipelineRole.addToPolicy(dynamoDBStreamPolicy);
openSearchIntegrationPipelineRole.addToPolicy(s3ExportPolicy);
openSearchIntegrationPipelineRole.addToPolicy(openSearchCollectionPolicy);

openSearchIntegrationPipelineRole.addToPolicy(
  new iam.PolicyStatement({
    effect: iam.Effect.ALLOW,
    actions: [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogGroups",
      "logs:DescribeLogStreams",
    ],
    resources: [
      `arn:aws:logs:${region}:${openSearchStack.account}:log-group:/aws/opensearchserverless/*`,
      `arn:aws:logs:${region}:${openSearchStack.account}:log-group:/aws/opensearchserverless/*:log-stream:*`,
    ],
  })
);

/**
 * Creates a data access policy for OpenSearch Serverless
 * This policy defines who can access what within the collection and its indexes
 */
const dataAccessPolicy = new oss.CfnAccessPolicy(
  openSearchStack,
  "DataAccessPolicy",
  {
    name: `ddb-etl-access-policy`,
    type: "data",
    description: `Data access policy for ${collectionName} collection`,
    policy: JSON.stringify([
      {
        /**
         * Collection Level Permissions
         * - CreateCollectionItems: Required for adding new documents
         * - DeleteCollectionItems: Required for removing documents
         * - UpdateCollectionItems: Required for modifying documents
         * - DescribeCollectionItems: Required for reading documents
         */
        Rules: [
          {
            ResourceType: "collection",
            Resource: [`collection/${collectionName}`],
            Permission: [
              "aoss:CreateCollectionItems",
              "aoss:DeleteCollectionItems",
              "aoss:UpdateCollectionItems",
              "aoss:DescribeCollectionItems",
            ],
          },
          /**
           * Index Level Permissions
           * - ReadDocument: Required for search operations
           * - WriteDocument: Required for document updates
           * - CreateIndex: Required for index initialization
           * - DeleteIndex: Required for index cleanup
           * - UpdateIndex: Required for index modifications
           * - DescribeIndex: Required for index metadata
           */
          {
            ResourceType: "index",
            Resource: [`index/${collectionName}/*`],
            Permission: [
              "aoss:ReadDocument",
              "aoss:WriteDocument",
              "aoss:CreateIndex",
              "aoss:DeleteIndex",
              "aoss:UpdateIndex",
              "aoss:DescribeIndex",
            ],
          },
        ],
        Principal: [
          // ETL Pipeline role
          openSearchIntegrationPipelineRole.roleArn,
          `arn:aws:iam::${openSearchStack.account}:role/Admin`,
          // AppSync HTTPDataSource role
          httpDataSourceRoleArn,
        ],
      },
    ]),
  }
);



// Create Log Group
const logGroup = new LogGroup(openSearchStack, "LogGroup", {
  logGroupName: "/aws/vendedlogs/OpenSearchServerlessService/pipelines/2",
  removalPolicy: RemovalPolicy.DESTROY,
});

interface OpenSearchConfig {
  tableArn: string;
  bucketName: string;
  region: string;
  tableName: string;
  pipelineRoleArn: string;
  openSearchEndpoint: string;
}

function createOpenSearchTemplate(config: OpenSearchConfig): string {
  const template = {
    version: "2",
    "dynamodb-pipeline": {
      source: {
        dynamodb: {
          acknowledgments: true,
          tables: [
            {
              table_arn: config.tableArn,
              stream: { start_position: "LATEST" },
              export: {
                s3_bucket: config.bucketName,
                s3_region: config.region,
                s3_prefix: `${config.tableName}/`,
              },
            },
          ],
          aws: { sts_role_arn: config.pipelineRoleArn, region: config.region },
        },
      },
      sink: [
        {
          opensearch: {
            hosts: [config.openSearchEndpoint],
            index: "movie",
            index_type: "custom",
            document_id: '${getMetadata("primary_key")}',
            action: '${getMetadata("opensearch_action")}',
            document_version: '${getMetadata("document_version")}',
            document_version_type: "external",
            flush_timeout: -1,
            aws: {
              sts_role_arn: config.pipelineRoleArn,
              region: config.region,
              serverless: true,
            },
          },
        },
      ],
    },
  };
  return YAML.stringify(template);
}

const openSearchTemplate = createOpenSearchTemplate({
  tableArn: tableArn,
  bucketName: backend.storage.resources.bucket.bucketName,
  region: region,
  tableName: tableName,
  pipelineRoleArn: openSearchIntegrationPipelineRole.roleArn,
  openSearchEndpoint: openSearchServerlessCollection.attrCollectionEndpoint,
});

//OpenSearch Pipeline Definition
new osis.CfnPipeline(
  openSearchStack,
  "OpenSearchServerlessIntegrationPipeline",
  {
    maxUnits: 4,
    minUnits: 1,
    pipelineConfigurationBody: openSearchTemplate,
    pipelineName: "dynamodb-integration",
    logPublishingOptions: {
      isLoggingEnabled: true,
      cloudWatchLogDestination: { logGroup: logGroup.logGroupName },
    },
  }
);


