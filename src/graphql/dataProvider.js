import buildDataProvider from 'ra-data-graphql';
import {
  CREATE,
  DELETE,
  DELETE_MANY,
  GET_LIST,
  GET_MANY,
  GET_MANY_REFERENCE,
  GET_ONE,
  UPDATE,
  UPDATE_MANY,
} from 'react-admin';
import { parseGraphQl } from '@api-platform/api-doc-parser';
import pluralize from 'pluralize';
import defaultBuildQuery from './buildQuery';

const lcfirst = (str) => str.charAt(0).toLowerCase() + str.slice(1);

const defaultOptions = {
  buildQuery: defaultBuildQuery,
  introspection: {
    operationNames: {
      [GET_LIST]: (resource) => lcfirst(pluralize(resource.name)),
      [GET_ONE]: (resource) => lcfirst(resource.name),
      [GET_MANY]: (resource) => lcfirst(pluralize(resource.name)),
      [GET_MANY_REFERENCE]: (resource) => lcfirst(pluralize(resource.name)),
      [CREATE]: (resource) => `create${resource.name}`,
      [UPDATE]: (resource) => `update${resource.name}`,
      [DELETE]: (resource) => `delete${resource.name}`,
    },
    exclude: undefined,
    include: undefined,
  },
};

export default (
  entrypoint,
  apiDocumentationParser = parseGraphQl,
  options = {},
) => {
  /** @type {Api} */
  let apiSchema;

  return buildDataProvider({
    ...defaultOptions,
    ...{ clientOptions: { uri: entrypoint } },
    ...options,
  }).then((defaultDataProvider) => {
    const dataProvider = (fetchType, resource, params) => {
      // API Platform does not support multiple deletions so instead we send multiple DELETE requests
      // This can be optimized using the apollo-link-batch-http link
      if (fetchType === DELETE_MANY) {
        const { ids, ...otherParams } = params;
        return Promise.all(
          params.ids.map((id) =>
            defaultDataProvider(DELETE, resource, {
              id,
              ...otherParams,
            }),
          ),
        ).then((results) => {
          const data = results.reduce((acc, { data }) => [...acc, data.id], []);

          return { data };
        });
      }
      // API Platform does not support multiple updates so instead we send multiple UPDATE requests
      // This can be optimized using the apollo-link-batch-http link
      if (fetchType === UPDATE_MANY) {
        const { ids, ...otherParams } = params;
        return Promise.all(
          params.ids.map((id) =>
            defaultDataProvider(UPDATE, resource, {
              id,
              ...otherParams,
            }),
          ),
        ).then((results) => {
          const data = results.reduce((acc, { data }) => [...acc, data.id], []);

          return { data };
        });
      }

      return defaultDataProvider(fetchType, resource, params);
    };

    return {
      getList: (resource, params) => dataProvider(GET_LIST, resource, params),
      getOne: (resource, params) => dataProvider(GET_ONE, resource, params),
      getMany: (resource, params) => dataProvider(GET_MANY, resource, params),
      getManyReference: (resource, params) =>
        dataProvider(GET_MANY_REFERENCE, resource, params),
      update: (resource, params) => dataProvider(UPDATE, resource, params),
      updateMany: (resource, params) =>
        dataProvider(UPDATE_MANY, resource, params),
      create: (resource, params) => dataProvider(CREATE, resource, params),
      delete: (resource, params) => dataProvider(DELETE, resource, params),
      deleteMany: (resource, params) =>
        dataProvider(DELETE_MANY, resource, params),
      introspect: () =>
        apiSchema
          ? Promise.resolve({ data: apiSchema })
          : apiDocumentationParser(entrypoint)
              .then(({ api, customRoutes = [] }) => {
                apiSchema = api;
                return { data: api, customRoutes };
              })
              .catch((error) => {
                if (error.status) {
                  throw new Error(
                    `Cannot fetch documentation: ${error.status}`,
                  );
                }
                throw error;
              }),
    };
  });
};
