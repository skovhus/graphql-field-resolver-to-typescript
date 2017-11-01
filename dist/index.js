"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("graphql");
const prettier_1 = require("prettier");
const render_1 = require("./render");
class Converter {
    async convert(typeDefs) {
        const schema = graphql_1.buildSchema(typeDefs);
        const renderer = new render_1.Renderer({});
        const introSpection = (await graphql_1.graphql(schema, graphql_1.introspectionQuery, {}));
        const result = await renderer.render(introSpection);
        return prettier_1.format(result, {
            parser: 'typescript',
            singleQuote: true,
            semi: false,
        });
    }
}
exports.Converter = Converter;
