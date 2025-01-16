# AWS Amplify OpenSearch Integration for Movie Data

This project integrates AWS Amplify with OpenSearch Serverless to create a searchable movie database. It demonstrates how to set up a data pipeline from DynamoDB to OpenSearch using AWS services.

The application allows users to create and search for movies using a React frontend powered by AWS Amplify. The backend utilizes DynamoDB for data storage and OpenSearch Serverless for efficient searching capabilities.

## Repository Structure

```
.
├── amplify/
│   ├── auth/
│   ├── backend.ts
│   ├── data/
│   │   ├── opensearch/
│   │   ├── resource.ts
│   │   ├── searchBlogResolver.js
│   ├── storage/
│   └── tsconfig.json
├── src/
│   ├── App.tsx
│   └── main.tsx
├── amplify.yml
├── package.json
├── tsconfig.json
└── vite.config.ts
```

Key Files:
- `amplify/backend.ts`: Defines the AWS backend resources
- `amplify/data/resource.ts`: Configures the data models and API
- `src/App.tsx`: Main React component for the frontend
- `src/main.tsx`: Entry point for the React application
- `amplify.yml`: Amplify build configuration
- `package.json`: Project dependencies and scripts
- `vite.config.ts`: Vite build configuration

## Usage Instructions

### Installation
