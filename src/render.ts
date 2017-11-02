import {
  IntrospectionType,
  IntrospectionObjectType,
  IntrospectionUnionType,
  IntrospectionInterfaceType,
  IntrospectionEnumType,
  IntrospectionInputObjectType,
  IntrospectionInputValue,
  IntrospectionTypeRef,
  IntrospectionScalarType,
  IntrospectionNamedTypeRef,
  IntrospectionListTypeRef,
  IntrospectionSchema,
  IntrospectionField,
  IntrospectionNonNullTypeRef,
  IntrospectionEnumValue,
  IntrospectionQuery,
} from 'graphql'
import { source, OMIT_NEXT_NEWLINE } from './renderTag'

export interface Options {
  tslint?: Object
}

function isScalar(x: IntrospectionTypeRef): x is IntrospectionScalarType {
  return x.kind === 'SCALAR'
}

function isEnum(x: IntrospectionTypeRef): x is IntrospectionEnumType {
  return x.kind === 'ENUM'
}

function isInputObject(
  x: IntrospectionTypeRef
): x is IntrospectionInputObjectType {
  return x.kind === 'INPUT_OBJECT'
}

function isUnion(x: IntrospectionTypeRef): x is IntrospectionUnionType {
  return x.kind === 'UNION'
}

function isNonNull(x: IntrospectionTypeRef): x is IntrospectionNonNullTypeRef {
  return x.kind === 'NON_NULL'
}

function isInterface(x: IntrospectionTypeRef): x is IntrospectionInterfaceType {
  return x.kind === 'INTERFACE'
}

function isObject(x: IntrospectionTypeRef): x is IntrospectionObjectType {
  return x.kind === 'OBJECT'
}

function isList(x: IntrospectionTypeRef): x is IntrospectionListTypeRef {
  return x.kind === 'LIST'
}

function isNamed(x: IntrospectionTypeRef): x is IntrospectionNamedTypeRef {
  return {}.hasOwnProperty.call(x, 'name')
}

const scalars: { [key: string]: string } = {
  String: 'string',
  Int: 'number',
  Float: 'number',
  Boolean: 'boolean',
  ID: 'string',
}

export class Renderer {
  private options: Options

  /**
   * Types that are not created as interface, because they are part of the introspection
   */
  private introspectionTypes: Set<string> = new Set([
    '__Schema',
    '__Type',
    '__TypeKind',
    '__Field',
    '__InputValue',
    '__EnumValue',
    '__Directive',
    '__DirectiveLocation',
  ])

  constructor(options: Options) {
    this.options = options
  }

  /**
   * Extract queryType, mutationType and subscriptionType
   *
   * Since mutationType and subscriptionType is optional they will only be strings if they exist-
   * By using symbols instead of null or undefined we avoid matching against nodes that don't have a name.
   */
  extractRootTypesFromSchema(schema: IntrospectionSchema) {
    return {
      queryType: schema.queryType.name,
      mutationType: schema.mutationType
        ? schema.mutationType.name
        : Symbol('mutationType'),
      subscriptionType: schema.subscriptionType
        ? schema.subscriptionType.name
        : Symbol('subscriptionType'),
    }
  }

  /**
   * Render the whole schema as interface
   */
  render(root: { data: IntrospectionQuery }): string {
    const namespace = source`

${this.renderTypes(root.data.__schema.types)}
${this.renderArguments(
      root.data.__schema.types,
      this.extractRootTypesFromSchema(root.data.__schema)
    )}
${this.renderInputObjects(root.data.__schema.types)}
${this.renderEnums(root.data.__schema.types)}
${this.renderUnions(root.data.__schema.types)}
${this.renderInterfaces(root.data.__schema.types)}
`

    return `${namespace.replace(/^\s+$/gm, '')}`
  }

  /**
   * Render a list of type (i.e. interfaces)
   */
  renderTypes(types: IntrospectionType[]) {
    return types
      .filter(type => !this.introspectionTypes.has(type.name))
      .filter(type => type.kind === 'OBJECT')
      .map((type: IntrospectionObjectType) => this.renderTypeDef(type, types))
      .join('\n\n')
  }

  /**
   * Render a Type (i.e. an interface)
   */
  renderTypeDef(
    type: IntrospectionObjectType,
    all: IntrospectionType[]
  ): string {
    return source`
${this.renderComment(type.description)}
export interface ${type.name} ${this.renderExtends(type)}{
    ${this.renderTypename(type.name, all)}${OMIT_NEXT_NEWLINE}
${type.fields.map(field => this.renderMemberWithComment(field)).join('\n')}
}
`
  }

  /**
   * Renders a __typename constant if the type is used in a union or interface.
   */
  renderTypename(forType: string, all: IntrospectionType[]): string {
    const usedBy = all
      .filter(type => !this.introspectionTypes.has(type.name))
      .filter(type => type.kind === 'UNION' || type.kind === 'INTERFACE')
      .filter(
        (type: IntrospectionUnionType | IntrospectionInterfaceType) =>
          type.possibleTypes.filter(cand => cand.name === forType).length > 0
      )
    if (usedBy.length === 0) {
      return ''
    }
    return `__typename: '${forType}';`
  }

  /**
   * Renders the extends clause of an interface (e.g. 'extends A, B. C').
   */
  renderExtends(type: IntrospectionObjectType): string {
    if (type.interfaces && type.interfaces.length > 0) {
      const interfaces = type.interfaces.map(it => `${it.name}`).join(', ')
      return `extends ${interfaces} `
    } else {
      return ''
    }
  }

  /**
   * Render a member (field or method) and its doc-comment
   */
  renderMemberWithComment(field: IntrospectionField): string {
    return source`
${this.renderComment(field.description)}
${this.renderMember(field)}
`
  }

  /**
   * Render a single field or method without doc-comment
   */
  renderMember(field: IntrospectionField) {
    const optional = field.type.kind !== 'NON_NULL'
    const type = this.renderType(field.type, false)
    const resultType = optional ? `${type} | null` : type
    return `${field.name}: ${resultType}`
  }

  /**
   * Render a single return type (or field type)
   * This function creates the base type that is then used as generic to a promise
   */
  renderType(type: IntrospectionTypeRef, optional: boolean): string {
    function maybeOptional(arg: any) {
      return optional ? `(${arg} | null)` : arg
    }
    function generic(arg: string): any {
      return `${arg}`
    }

    if (isScalar(type)) {
      if (!scalars.hasOwnProperty(type.name)) {
        throw new TypeError(
          `Invalid argument: ${type.name} is not a supported SCALAR`
        )
      }

      return maybeOptional(scalars[type.name])
    }

    if (isEnum(type) || isInputObject(type)) {
      return maybeOptional(type.name)
    }

    if (isObject(type) || isUnion(type) || isInterface(type)) {
      return maybeOptional(generic(type.name))
    }

    if (isList(type) && type.ofType) {
      return maybeOptional(`${this.renderType(type.ofType, true)}[]`)
    }

    if (isNonNull(type) && type.ofType) {
      return this.renderType(type.ofType, false)
    }

    throw new TypeError(`Invalid argument: ${type.kind}`)
  }

  /**
   * Render a description as doc-comment
   */
  renderComment(description?: string): string | typeof OMIT_NEXT_NEWLINE {
    if (!description) {
      // Parsed by the `source` tag-function to remove the next newline
      return OMIT_NEXT_NEWLINE
    }
    return `/**\n * ` + description.split('\n').join(`\n * `) + `\n */`
  }

  /**
   * Render the arguments of a function
   */
  renderArgumentType(args: IntrospectionInputValue[]) {
    const base = args
      .map(arg => {
        return `${arg.name}: ${this.renderType(arg.type, false)}`
      })
      .join(', ')
    return `{${base}}`
  }

  /**
   * Render a list of enums.
   */
  renderEnums(types: IntrospectionType[]) {
    return types
      .filter(type => !this.introspectionTypes.has(type.name))
      .filter(type => type.kind === 'ENUM')
      .map((type: IntrospectionEnumType) => this.renderEnum(type))
      .join(';')
  }

  /**
   * Render an Enum.
   */
  renderEnum(type: IntrospectionEnumType): string {
    return source`
${this.renderComment(type.description)}
export type ${type.name} = ${type.enumValues
      .map(value => `'${value.name}'`)
      .join(' | ')}`
  }

  /**
   * Renders a type definition for an enum value.
   */
  renderEnumValueType(value: IntrospectionEnumValue): string {
    return source`
${value.name}: '${value.name}',
`
  }

  /**
   * Renders a the definition of an enum value.
   */
  renderEnumValue(value: IntrospectionEnumValue): string {
    return source`
${this.renderComment(value.description)}
${value.name}: '${value.name}',
`
  }

  /**
   * Render a list of unions.
   */
  renderUnions(types: IntrospectionType[]) {
    return types
      .filter(type => !this.introspectionTypes.has(type.name))
      .filter(type => type.kind === 'UNION')
      .map((type: IntrospectionUnionType) => this.renderUnion(type))
      .join('\n')
  }

  /**
   * Render a union.
   */
  renderUnion(type: IntrospectionUnionType): string {
    // Scalars cannot be used in unions, so we're safe here
    const unionValues = type.possibleTypes
      .map(type => `${type.name}`)
      .join(' | ')
    return source`
${this.renderComment(type.description)}
export type ${type.name} = ${unionValues}

`
  }

  /**
   * Render a list of interfaces.
   */
  renderInterfaces(types: IntrospectionType[]) {
    return types
      .filter(type => !this.introspectionTypes.has(type.name))
      .filter(type => type.kind === 'INTERFACE')
      .map((type: IntrospectionInterfaceType) => this.renderInterface(type))
      .join('\n')
  }

  /**
   * Render an interface.
   */
  renderInterface(type: IntrospectionInterfaceType): string {
    return source`
${this.renderComment(type.description)}
export interface ${type.name} {
    ${type.fields.map(field => this.renderMemberWithComment(field)).join('\n')}
}
`
  }

  renderArguments(
    types: IntrospectionType[],
    {
      queryType,
      mutationType,
      subscriptionType,
    }: {
      queryType: string
      mutationType: string | symbol
      subscriptionType?: string | symbol
    }
  ) {
    return types
      .filter(type => !this.introspectionTypes.has(type.name))
      .filter(
        type =>
          type.name === queryType ||
          type.name === mutationType ||
          (subscriptionType !== undefined && type.name === subscriptionType)
      )
      .map((type: IntrospectionObjectType) => type.fields)
      .reduce((memo, fields) => memo.concat(fields), [])
      .map(type => renderInputsInterfaces(type))
      .join('')

    function renderInputsInterfaces(type: IntrospectionField) {
      return `
export interface ${type.name}Args {
${type.args.map(renderArg).join('\n')}
}
`
    }

    function getTypeRefName(typeRef: IntrospectionTypeRef) {
      if (isNonNull(typeRef) || isList(typeRef)) {
        if (typeRef.ofType && isNamed(typeRef.ofType)) {
          return typeRef.ofType.kind === 'SCALAR'
            ? scalars[typeRef.ofType.name]
            : typeRef.ofType.kind
        }
      }

      if (isNamed(typeRef) && scalars.hasOwnProperty(typeRef.name)) {
        return typeRef.kind === 'SCALAR' ? typeRef.name : typeRef.kind
      }

      return 'any'
    }

    function renderArg(arg: IntrospectionInputValue) {
      const optional = arg.type.kind === 'NON_NULL' ? '' : '?'
      return `    ${arg.name}${optional}: ${getTypeRefName(arg.type)}`
    }
  }

  /**
   * Render a list of input object.
   */
  renderInputObjects(types: IntrospectionType[]) {
    return types
      .filter(type => !this.introspectionTypes.has(type.name))
      .filter(type => type.kind === 'INPUT_OBJECT')
      .map((type: IntrospectionInputObjectType) => this.renderInputObject(type))
      .join('\n')
  }

  /**
   * Render an input object.
   */
  renderInputObject(type: IntrospectionInputObjectType): string {
    return source`
${this.renderComment(type.description)}
export interface ${type.name} {
    ${type.inputFields
      .map(field => this.renderInputMemberWithComment(field))
      .join('\n')}
}
`
  }

  /**
   * Render a input member (field or method) and its doc-comment
   */
  renderInputMemberWithComment(field: IntrospectionInputValue): string {
    return source`
${this.renderComment(field.description)}
${this.renderInputMember(field)}
`
  }

  /**
   * Render a single input field or method without doc-comment
   */
  renderInputMember(field: IntrospectionInputValue) {
    const type = this.renderType(field.type, false)
    // Render property as field, with the option of being of a function-type () => ReturnValue
    const optional = field.type.kind !== 'NON_NULL'
    const name = optional ? field.name + '?' : field.name
    return `${name}: ${type}`
  }
}
