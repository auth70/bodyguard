export const MAX_KEYS = 100;
export const MAX_DEPTH = 10;
export const MAX_SIZE = 1024 * 1024;
export const MAX_KEY_LENGTH = 100;

export const CONTENT_TYPES = [
    "application/json",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "text/plain",
];

export const ERRORS = {
    BODY_NOT_AVAILABLE: "BODY_NOT_AVAILABLE",
    INVALID_TYPE: "INVALID_TYPE",
    INVALID_CONTENT_TYPE: "INVALID_CONTENT_TYPE",
    NO_CONTENT_TYPE: "NO_CONTENT_TYPE",
    MAX_SIZE_EXCEEDED: "MAX_SIZE_EXCEEDED",
    TOO_MANY_KEYS: "TOO_MANY_KEYS",
    INVALID_INPUT: "INVALID_INPUT",
    TOO_DEEP: "TOO_DEEP",
    KEY_TOO_LONG: "KEY_TOO_LONG",
    TOO_MANY_FILES: "TOO_MANY_FILES",
    FILENAME_TOO_LONG: "FILENAME_TOO_LONG",
};

/**
 * Types
 */

export type State = 'START' | 'KEY' | 'VALUE';

export type BodyguardValidator<T extends JSONLike = JSONLike> = (data: unknown) => T;

export interface BodyguardConfig {
    /** The maximum number of keys */
    maxKeys: number;
    /** The maximum depth of the object */
    maxDepth: number;
    /** The maximum size of the input in bytes */
    maxSize: number;
    /** The maximum length of a key */
    maxKeyLength: number;
    /** Automatically cast numbers from strings */
    castNumbers: boolean;
    /** Automatically cast booleans from strings */
    castBooleans: boolean;
}

export interface BodyguardFormConfig extends BodyguardConfig {
    /** Convert plus signs to spaces in urlencoded form data */
    convertPluses: boolean;
    /** The maximum number of files in a multipart form */
    maxFiles: number;
    /** The maximum length of a filename in a multipart form */
    maxFilenameLength: number;
    /** Allow list for content types in a multipart form */
    allowedContentTypes: string[] | undefined;
}

export type JSONLike =
    | { [property: string]: JSONLike }
    | readonly JSONLike[]
    | string
    | number
    | boolean
    | File
    | null;

/**
 * A standard generic issue. This is based on the Zod issue type, but may be thrown by other libraries through a possible rethrowing adapter.
 */
export type GenericIssue = {
    code: string;
    path: (string | number)[];
    message: string;
    minimum?: number | bigint;
    maximum?: number | bigint;
    exact?: boolean;
    inclusive?: boolean;
    validation?: any;
};

export type GenericError = { issues?: GenericIssue[]; message?: string };

export type BodyguardError<ErrorType = GenericError, ValueType extends JSONLike = Record<string, any>> = {
    success: false;
    /** The error message */
    error: ErrorType;
    /** The value that was being processed. May be undefined if the error occurred before the value was processed. */
    value?: ValueType;
};

export type BodyguardSuccess<ValueType extends JSONLike = Record<string, any>> = {
    success: true;
    value: ValueType;
};

export type BodyguardResult<
    ValueType extends JSONLike = Record<string, any>,
    ErrorType = GenericError,
> = BodyguardSuccess<ValueType> | BodyguardError<ErrorType, ValueType>;

/**
 * Utility functions
 */  

/**
 * Create a byte stream counter. This is a transform stream that counts the number of bytes. If the number of bytes exceeds the maxSize, it will throw an error.
 * @param {ReadableStream<Uint8Array>} stream - The input stream
 * @param {number} maxSize - The maximum number of bytes
 * @param {(reason?: any) => void} reject - A reject function to call when the max size is exceeded
 * @returns {TransformStream<Uint8Array>} - The transform stream
 */
export function createByteStreamCounter(stream: ReadableStream<Uint8Array>, maxSize: number, reject?: (reason?: any) => void) {
    let bytes = 0;
    return new TransformStream<Uint8Array>({
        transform(chunk, controller) {
            bytes += chunk.length;
            if(bytes > maxSize) {
                if(reject) reject(new Error(ERRORS.MAX_SIZE_EXCEEDED));
                else throw new Error(ERRORS.MAX_SIZE_EXCEEDED);
            }
            controller.enqueue(chunk);
        }
    });
}

/**
 * Possible cast a value to a number or boolean if it matches the criteria.
 * Also converts plus signs to spaces if convertPluses is true.
 * @param {string} value - The value to cast
 * @param {BodyguardConfig | BodyguardFormConfig} config - The configuration
 * @returns {string | number | boolean} - The casted value
 */
export function possibleCast(value: string, config: BodyguardConfig | BodyguardFormConfig) {
    value = value.replace(/[\r\n]+$/, '');
    if(value.trim() === '') return value;
    if(!isNaN(Number(value)) && config.castNumbers) return Number(value);
    if(value === 'true' && config.castBooleans) return true;
    if(value === 'false' && config.castBooleans) return false;
    if((config as BodyguardFormConfig).convertPluses) return value.replace(/\+/g, ' ');
    return value;
}

/**
 * Assign a nested value to an object
 * @param {Record<string, any>} obj - The object to assign to
 * @param {string[]} path - The path to assign to
 * @param {any} value - The value to assign
 */
export function assignNestedValue(obj: Record<string, any>, path: string[], value: any) {
    let current = obj;
    for (let i = 0; i < path.length; i++) {
        const segment = path[i];
        const arrayMatch = segment.match(/^(\w+)(?:\[(\d*?)\])?$/);

        if (arrayMatch && arrayMatch[1]) {
            const key = arrayMatch[1];
            const index = arrayMatch[2];

            if (i === path.length - 1) { // last segment
                if (index !== undefined) { // Explicit index
                    if (index) { // array1[1], array1[2], ...
                        if (!Array.isArray(current[key])) {
                            current[key] = [];
                        }
                        current[key][parseInt(index, 10)] = value;
                    } else { // array1[] behavior
                        if (!Array.isArray(current[key])) {
                            current[key] = [];
                        }
                        current[key].push(value);
                    }
                } else {
                    current[key] = value;
                }
            } else {
                if (index !== undefined) {
                    if (!Array.isArray(current[key])) {
                        current[key] = [];
                    }
                    if (index) { // If there is an explicit index, use it
                        if (!current[key][parseInt(index, 10)]) {
                            current[key][parseInt(index, 10)] = {};
                        }
                        current = current[key][parseInt(index, 10)];
                    } else { // If it's the implicit push behavior
                        if (!current[key].length || typeof current[key][current[key].length - 1] !== 'object') {
                            current[key].push({});
                        }
                        current = current[key][current[key].length - 1];
                    }
                } else {
                    if (!current[key]) {
                        current[key] = {};
                    }
                    current = current[key];
                }
            }
        } else {
            throw new Error("Invalid segment encountered in segment: " + segment + " of path: " + path.join('.'));
        }
    }
}

/**
 * Extract a nested key into an array of segments
 * @param {string} keyName - The key name
 * @returns {string[]} - The segments
 */
export function extractNestedKey(keyName: string) {
    const path: string[] = [];
    let buffer = '';
    for (const char of keyName) {
        if (char === '.') {
            if (buffer) path.push(buffer);
            buffer = '';
        } else {
            buffer += char;
        }
    }
    if (buffer) path.push(buffer);
    return path;
}
