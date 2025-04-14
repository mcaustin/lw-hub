import { util } from "@aws-appsync/utils";

/**
 * Searches for documents by using an input term
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the request
 */

export function request(ctx) {
  return {
    method: "GET",
    params: {
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        q: ctx.args.q ,
      },
    },
    resourcePath: "/",
  };
}
/**
 * Returns the fetched items
 * @param {import('@aws-appsync/utils').Context} ctx the context
 * @returns {*} the result
 */

export function response(ctx) {
  const { statusCode, body } = ctx.result;
  if (statusCode === 200) {
    return JSON.parse(body).hits.hits.map((hit) => hit._source);
  }
}
