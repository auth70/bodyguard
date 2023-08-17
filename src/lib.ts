export const MAX_KEYS = 100;
export const MAX_DEPTH = 10;
export const MAX_SIZE = 1024 * 1024;
export const MAX_KEY_LENGTH = 100;

export type BodyValidator = <SchemaType> (obj: JsonStruct | JsonPrimitive, schema: SchemaType) => Promise<ParserResult<SchemaType>>;

export type ParserConfig = {
    maxKeys: number;
    maxDepth: number;
    maxSize: number;
    maxKeyLength: number;
}

export type ParserError = {
    success: false;
    error: string;
};

export type ParserSuccess<T> = {
    success: true;
    value: T;
};

export type ParserResult<SuccessType> = ParserSuccess<SuccessType> | ParserError;

export type JsonPrimitive = string | number | boolean | null;
export type JsonKey = string | number | undefined;
export type JsonObject = { [key: string]: JsonPrimitive | JsonStruct };
export type JsonArray = (JsonPrimitive | JsonStruct)[];
export type JsonStruct = JsonObject | JsonArray;

export type JSONLike = {
    [key: string]: JSONLike | string | number | boolean | null | undefined;
} | string | number | boolean | null;

export const CONTENT_TYPES = [
    "application/json",
    "application/x-www-form-urlencoded",
    "multipart/form-data",
    "text/plain",
];

export const ERRORS = {
    REQUEST_BODY_NOT_AVAILABLE: "REQUEST_BODY_NOT_AVAILABLE",
    INVALID_TYPE: "INVALID_TYPE",
    INVALID_MAX_DEPTH: "INVALID_MAX_DEPTH",
    INVALID_MAX_KEYS: "INVALID_MAX_KEYS",
    INVALID_MAX_SIZE: "INVALID_MAX_SIZE",
    INVALID_CONTENT_TYPE: "INVALID_CONTENT_TYPE",
    NO_CONTENT_LENGTH: "NO_CONTENT_LENGTH",
    INVALID_VALIDATOR: "INVALID_VALIDATOR",
    NO_CONTENT_TYPE: "NO_CONTENT_TYPE",
    MAX_SIZE_EXCEEDED: "MAX_SIZE_EXCEEDED",
    STREAM_NOT_AVAILABLE: "STREAM_NOT_AVAILABLE",
    TOO_MANY_KEYS: "TOO_MANY_KEYS",
    INVALID_JSON: "INVALID_JSON",
    TOO_DEEP: "TOO_DEEP",
    KEY_TOO_LONG: "KEY_TOO_LONG",
};

export function createByteStreamCounter(stream: ReadableStream<Uint8Array>, maxSize: number, reject?: (reason?: any) => void) {
    let bytes = 0;
    return new TransformStream({
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

export function getPossibleNumber(value: string) {
    value = value.replace(/[\r\n]+$/, '');
    if(value.trim() === '') return value;
    if(!isNaN(Number(value))) return Number(value);
    return value;
}

export function assignNestedValue(obj: Record<string, any>, path: string[], value: any) {
    let current = obj;
    for (let i = 0; i < path.length; i++) {
        const segment = path[i];
        const arrayMatch = segment.match(/^(\w+)(?:\[(\d*?)\])?$/);

        if (arrayMatch) {
            const key = arrayMatch[1];
            const index = arrayMatch[2];

            if (!key) throw new Error("Invalid empty key segment encountered in path: " + segment);

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
            throw new Error("Invalid segment encountered in path: " + segment);
        }
    }
}

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