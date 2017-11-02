"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const renderTag_1 = require("./renderTag");
function isScalar(x) {
    return x.kind === 'SCALAR';
}
function isEnum(x) {
    return x.kind === 'ENUM';
}
function isInputObject(x) {
    return x.kind === 'INPUT_OBJECT';
}
function isUnion(x) {
    return x.kind === 'UNION';
}
function isNonNull(x) {
    return x.kind === 'NON_NULL';
}
function isInterface(x) {
    return x.kind === 'INTERFACE';
}
function isObject(x) {
    return x.kind === 'OBJECT';
}
function isList(x) {
    return x.kind === 'LIST';
}
function isNamed(x) {
    return {}.hasOwnProperty.call(x, 'name');
}
const scalars = {
    String: 'string',
    Int: 'number',
    Float: 'number',
    Boolean: 'boolean',
    ID: 'string',
};
class Renderer {
    constructor(options) {
        /**
         * Types that are not created as interface, because they are part of the introspection
         */
        this.introspectionTypes = new Set([
            '__Schema',
            '__Type',
            '__TypeKind',
            '__Field',
            '__InputValue',
            '__EnumValue',
            '__Directive',
            '__DirectiveLocation',
        ]);
        this.options = options;
    }
    /**
     * Extract queryType, mutationType and subscriptionType
     *
     * Since mutationType and subscriptionType is optional they will only be strings if they exist-
     * By using symbols instead of null or undefined we avoid matching against nodes that don't have a name.
     */
    extractRootTypesFromSchema(schema) {
        return {
            queryType: schema.queryType.name,
            mutationType: schema.mutationType
                ? schema.mutationType.name
                : Symbol('mutationType'),
            subscriptionType: schema.subscriptionType
                ? schema.subscriptionType.name
                : Symbol('subscriptionType'),
        };
    }
    /**
     * Render the whole schema as interface
     */
    render(root) {
        const namespace = renderTag_1.source `

${this.renderTypes(root.data.__schema.types)}
${this.renderArguments(root.data.__schema.types, this.extractRootTypesFromSchema(root.data.__schema))}
${this.renderInputObjects(root.data.__schema.types)}
${this.renderEnums(root.data.__schema.types)}
${this.renderUnions(root.data.__schema.types)}
${this.renderInterfaces(root.data.__schema.types)}
`;
        return `${namespace.replace(/^\s+$/gm, '')}`;
    }
    /**
     * Render a list of type (i.e. interfaces)
     */
    renderTypes(types) {
        return types
            .filter(type => !this.introspectionTypes.has(type.name))
            .filter(type => type.kind === 'OBJECT')
            .map((type) => this.renderTypeDef(type, types))
            .join('\n\n');
    }
    /**
     * Render a Type (i.e. an interface)
     */
    renderTypeDef(type, all) {
        return renderTag_1.source `
${this.renderComment(type.description)}
export interface ${type.name} ${this.renderExtends(type)}{
    ${this.renderTypename(type.name, all)}${renderTag_1.OMIT_NEXT_NEWLINE}
${type.fields.map(field => this.renderMemberWithComment(field)).join('\n')}
}
`;
    }
    /**
     * Renders a __typename constant if the type is used in a union or interface.
     */
    renderTypename(forType, all) {
        const usedBy = all
            .filter(type => !this.introspectionTypes.has(type.name))
            .filter(type => type.kind === 'UNION' || type.kind === 'INTERFACE')
            .filter((type) => type.possibleTypes.filter(cand => cand.name === forType).length > 0);
        if (usedBy.length === 0) {
            return '';
        }
        return `__typename: '${forType}';`;
    }
    /**
     * Renders the extends clause of an interface (e.g. 'extends A, B. C').
     */
    renderExtends(type) {
        if (type.interfaces && type.interfaces.length > 0) {
            const interfaces = type.interfaces.map(it => `${it.name}`).join(', ');
            return `extends ${interfaces} `;
        }
        else {
            return '';
        }
    }
    /**
     * Render a member (field or method) and its doc-comment
     */
    renderMemberWithComment(field) {
        return renderTag_1.source `
${this.renderComment(field.description)}
${this.renderMember(field)}
`;
    }
    /**
     * Render a single field or method without doc-comment
     */
    renderMember(field) {
        const optional = field.type.kind !== 'NON_NULL';
        const type = this.renderType(field.type, false);
        const resultType = optional ? `${type} | null` : type;
        return `${field.name}: ${resultType}`;
    }
    /**
     * Render a single return type (or field type)
     * This function creates the base type that is then used as generic to a promise
     */
    renderType(type, optional) {
        function maybeOptional(arg) {
            return optional ? `(${arg} | null)` : arg;
        }
        function generic(arg) {
            return `${arg}`;
        }
        if (isScalar(type)) {
            if (!scalars.hasOwnProperty(type.name)) {
                throw new TypeError(`Invalid argument: ${type.name} is not a supported SCALAR`);
            }
            return maybeOptional(scalars[type.name]);
        }
        if (isEnum(type) || isInputObject(type)) {
            return maybeOptional(type.name);
        }
        if (isObject(type) || isUnion(type) || isInterface(type)) {
            return maybeOptional(generic(type.name));
        }
        if (isList(type) && type.ofType) {
            return maybeOptional(`${this.renderType(type.ofType, true)}[]`);
        }
        if (isNonNull(type) && type.ofType) {
            return this.renderType(type.ofType, false);
        }
        throw new TypeError(`Invalid argument: ${type.kind}`);
    }
    /**
     * Render a description as doc-comment
     */
    renderComment(description) {
        if (!description) {
            // Parsed by the `source` tag-function to remove the next newline
            return renderTag_1.OMIT_NEXT_NEWLINE;
        }
        return `/**\n * ` + description.split('\n').join(`\n * `) + `\n */`;
    }
    /**
     * Render the arguments of a function
     */
    renderArgumentType(args) {
        const base = args
            .map(arg => {
            return `${arg.name}: ${this.renderType(arg.type, false)}`;
        })
            .join(', ');
        return `{${base}}`;
    }
    /**
     * Render a list of enums.
     */
    renderEnums(types) {
        return types
            .filter(type => !this.introspectionTypes.has(type.name))
            .filter(type => type.kind === 'ENUM')
            .map((type) => this.renderEnum(type))
            .join(';');
    }
    /**
     * Render an Enum.
     */
    renderEnum(type) {
        return renderTag_1.source `
${this.renderComment(type.description)}
export type ${type.name} = ${type.enumValues
            .map(value => `'${value.name}'`)
            .join(' | ')}`;
    }
    /**
     * Renders a type definition for an enum value.
     */
    renderEnumValueType(value) {
        return renderTag_1.source `
${value.name}: '${value.name}',
`;
    }
    /**
     * Renders a the definition of an enum value.
     */
    renderEnumValue(value) {
        return renderTag_1.source `
${this.renderComment(value.description)}
${value.name}: '${value.name}',
`;
    }
    /**
     * Render a list of unions.
     */
    renderUnions(types) {
        return types
            .filter(type => !this.introspectionTypes.has(type.name))
            .filter(type => type.kind === 'UNION')
            .map((type) => this.renderUnion(type))
            .join('\n');
    }
    /**
     * Render a union.
     */
    renderUnion(type) {
        // Scalars cannot be used in unions, so we're safe here
        const unionValues = type.possibleTypes
            .map(type => `${type.name}`)
            .join(' | ');
        return renderTag_1.source `
${this.renderComment(type.description)}
export type ${type.name} = ${unionValues}

`;
    }
    /**
     * Render a list of interfaces.
     */
    renderInterfaces(types) {
        return types
            .filter(type => !this.introspectionTypes.has(type.name))
            .filter(type => type.kind === 'INTERFACE')
            .map((type) => this.renderInterface(type))
            .join('\n');
    }
    /**
     * Render an interface.
     */
    renderInterface(type) {
        return renderTag_1.source `
${this.renderComment(type.description)}
export interface ${type.name} {
    ${type.fields.map(field => this.renderMemberWithComment(field)).join('\n')}
}
`;
    }
    renderArguments(types, { queryType, mutationType, subscriptionType, }) {
        return types
            .filter(type => !this.introspectionTypes.has(type.name))
            .filter(type => type.name === queryType ||
            type.name === mutationType ||
            (subscriptionType !== undefined && type.name === subscriptionType))
            .map((type) => type.fields)
            .reduce((memo, fields) => memo.concat(fields), [])
            .map(type => renderInputsInterfaces(type))
            .join('');
        function renderInputsInterfaces(type) {
            return `
export interface ${type.name}Args {
${type.args.map(renderArg).join('\n')}
}
`;
        }
        function getTypeRefName(typeRef) {
            if (isNonNull(typeRef) || isList(typeRef)) {
                if (typeRef.ofType && isNamed(typeRef.ofType)) {
                    return typeRef.ofType.kind === 'SCALAR'
                        ? scalars[typeRef.ofType.name]
                        : typeRef.ofType.kind;
                }
            }
            if (isNamed(typeRef) && scalars.hasOwnProperty(typeRef.name)) {
                return typeRef.kind === 'SCALAR' ? typeRef.name : typeRef.kind;
            }
            return 'any';
        }
        function renderArg(arg) {
            const optional = arg.type.kind === 'NON_NULL' ? '' : '?';
            return `    ${arg.name}${optional}: ${getTypeRefName(arg.type)}`;
        }
    }
    /**
     * Render a list of input object.
     */
    renderInputObjects(types) {
        return types
            .filter(type => !this.introspectionTypes.has(type.name))
            .filter(type => type.kind === 'INPUT_OBJECT')
            .map((type) => this.renderInputObject(type))
            .join('\n');
    }
    /**
     * Render an input object.
     */
    renderInputObject(type) {
        return renderTag_1.source `
${this.renderComment(type.description)}
export interface ${type.name} {
    ${type.inputFields
            .map(field => this.renderInputMemberWithComment(field))
            .join('\n')}
}
`;
    }
    /**
     * Render a input member (field or method) and its doc-comment
     */
    renderInputMemberWithComment(field) {
        return renderTag_1.source `
${this.renderComment(field.description)}
${this.renderInputMember(field)}
`;
    }
    /**
     * Render a single input field or method without doc-comment
     */
    renderInputMember(field) {
        const type = this.renderType(field.type, false);
        // Render property as field, with the option of being of a function-type () => ReturnValue
        const optional = field.type.kind !== 'NON_NULL';
        const name = optional ? field.name + '?' : field.name;
        return `${name}: ${type}`;
    }
}
exports.Renderer = Renderer;
