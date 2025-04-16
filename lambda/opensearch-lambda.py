import boto3
import json
import requests
from requests_aws4auth import AWS4Auth

region = 'us-east-1' # For example, us-west-1
service = 'es'
credentials = boto3.Session().get_credentials()
awsauth = AWS4Auth(credentials.access_key, credentials.secret_key, region, service, session_token=credentials.token)

host = 'https://search-lwdata-zi6ee652wekk73tkstttq3xpie.aos.us-east-1.on.aws' # The OpenSearch domain endpoint with https:// and without a trailing slash
index = 'bases'
url = host + '/' + index + '/_search'

def get_query_param(event, key):
    if key in event['queryStringParameters']:
        return event['queryStringParameters'][key]
    else:
        return None


# Lambda execution starts here
def lambda_handler(event, context):

    for key, value in event.items():
        print(f"{key}: {value}")

    # Put the user query into the query DSL for more accurate search results.
    # Note that certain fields are boosted (^).
    queryParam = get_query_param(event, "q")
    warzone = get_query_param(event, "z")
    level = get_query_param(event, "l")

    print("QueryParam=" + queryParam)
    

    query = {
        "size": 25,
        "query": {
            "bool": {
                "must": {
                    "query_string": {
                        "query": queryParam
                    }
                },
                "filter": []
            },
        },
        "collapse": {
            "field": "ownerId.keyword",
        },
        "sort": [
            {"time": "desc"}
        ] 
    }

    if warzone is not None:
        query["query"]["bool"]["filter"].append({ "term": { "warzone": warzone } } )
    
    if level is not None:
        query["query"]["bool"]["filter"].append( { "term": { "level": level } } ) 
    
    print("json=" + json.dumps(query))

    # Elasticsearch 6.x requires an explicit Content-Type header
    headers = { "Content-Type": "application/json" }

    # Make the signed HTTP request
    r = requests.get(url, auth=awsauth, headers=headers, data=json.dumps(query))

    # Create the response and add some extra content to support CORS
    response = {
        "statusCode": 200,
        "headers": {
            "Access-Control-Allow-Origin": '*'
        },
        "isBase64Encoded": False
    }

    # Add the search results to the response
    response['body'] = r.text
    return response