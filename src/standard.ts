import type { GenericIssue } from "./lib.js";

/**
 * The Standard Schema interface.
 * Copied from the Standard Schema v1 spec; this package does not depend on `@standard-schema/spec`.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
    /** The Standard Schema properties. */
    readonly "~standard": StandardSchemaV1.Props<Input, Output>;
}

export declare namespace StandardSchemaV1 {
    /** The Standard Schema properties interface. */
    export interface Props<Input = unknown, Output = Input> {
        /** The version number of the standard. */
        readonly version: 1;
        /** The vendor name of the schema library. */
        readonly vendor: string;
        /** Validates unknown input values. */
        readonly validate: (
            value: unknown
        ) => Result<Output> | Promise<Result<Output>>;
        /** Inferred types associated with the schema. */
        readonly types?: Types<Input, Output> | undefined;
    }

    /** The result interface of the validate function. */
    export type Result<Output> = SuccessResult<Output> | FailureResult;

    /** The result interface if validation succeeds. */
    export interface SuccessResult<Output> {
        /** The typed output value. */
        readonly value: Output;
        /** The non-existent issues. */
        readonly issues?: undefined;
    }

    /** The result interface if validation fails. */
    export interface FailureResult {
        /** The issues of failed validation. */
        readonly issues: ReadonlyArray<Issue>;
    }

    /** The issue interface of the failure output. */
    export interface Issue {
        /** The error message of the issue. */
        readonly message: string;
        /** The path of the issue, if any. */
        readonly path?: ReadonlyArray<PropertyKey | PathSegment> | undefined;
    }

    /** The path segment interface of the issue. */
    export interface PathSegment {
        /** The key representing a path segment. */
        readonly key: PropertyKey;
    }

    /** The Standard Schema types interface. */
    export interface Types<Input = unknown, Output = Input> {
        /** The input type of the schema. */
        readonly input: Input;
        /** The output type of the schema. */
        readonly output: Output;
    }

    /** Infers the input type of a Standard Schema. */
    export type InferInput<Schema extends StandardSchemaV1> = NonNullable<
        Schema["~standard"]["types"]
    >["input"];

    /** Infers the output type of a Standard Schema. */
    export type InferOutput<Schema extends StandardSchemaV1> = NonNullable<
        Schema["~standard"]["types"]
    >["output"];
}

/**
 * Returns true when `value` is a Standard Schema v1 object.
 * @param {unknown} value - Candidate validator
 * @returns {value is StandardSchemaV1} Whether the value implements Standard Schema v1
 */
export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) {
        return false;
    }
    const standard = (value as { ["~standard"]?: unknown })["~standard"];
    if (typeof standard !== "object" || standard === null) {
        return false;
    }
    const props = standard as { version?: unknown; validate?: unknown };
    return props.version === 1 && typeof props.validate === "function";
}

/**
 * Unwraps a Standard Schema path segment to a `string` or `number`.
 * `{ key }` objects are flattened; symbols are stringified.
 * @param {PropertyKey | StandardSchemaV1.PathSegment} segment - A path segment from a Standard Schema issue
 * @returns {string | number} The unwrapped path key
 */
function unwrapPathSegment(segment: PropertyKey | StandardSchemaV1.PathSegment): string | number {
    const key = (typeof segment === "object" && segment !== null && "key" in segment)
        ? segment.key
        : segment;
    if (typeof key === "symbol") {
        return String(key);
    }
    return key;
}

/**
 * Maps a Standard Schema issue onto Bodyguard's `GenericIssue` shape.
 * @param {StandardSchemaV1.Issue} issue - A Standard Schema issue
 * @returns {GenericIssue} `{ code: "custom", path, message }`
 */
export function standardIssueToGenericIssue(issue: StandardSchemaV1.Issue): GenericIssue {
    return {
        code: "custom",
        path: (issue.path ?? []).map(unwrapPathSegment),
        message: issue.message,
    };
}
