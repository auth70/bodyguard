import type { StandardSchemaV1 } from "./standard.js";

export const MAX_KEYS = 10000;
export const MAX_DEPTH = 100;
export const MAX_SIZE = 1024 * 1024;
export const MAX_KEY_LENGTH = 1000;

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
    KEY_CONFLICT: "KEY_CONFLICT",
    INDEX_TOO_LARGE: "INDEX_TOO_LARGE",
};

/**
 * Types
 */

export type State = 'START' | 'KEY' | 'VALUE';

export type JSONLike =
    | { [property: string]: JSONLike }
    | readonly JSONLike[]
    | string
    | number
    | boolean
    | File
    | null;

export type BodyguardValidator<T extends JSONLike = JSONLike> = (data: unknown) => T;

/** A throwing function validator or a Standard Schema v1 object. */
export type BodyguardAcceptedValidator = BodyguardValidator | StandardSchemaV1;

/**
 * Output type of a validator passed to Bodyguard methods.
 * Standard Schema objects infer `InferOutput`; function validators infer `ReturnType`;
 * omitted validators infer `TDefault`.
 */
export type BodyguardValidatorOutput<T, TDefault = JSONLike> =
    T extends StandardSchemaV1 ? StandardSchemaV1.InferOutput<T> :
    T extends BodyguardValidator ? ReturnType<T> :
    TDefault;

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
    /** Transform parsed data after parsing and before validation */
    transform?: (value: JSONLike) => JSONLike | Promise<JSONLike>;
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

export type BodyguardError<ErrorType = GenericError, ValueType = JSONLike> = {
    success: false;
    /** The error message */
    error: ErrorType;
    /** The value that was being processed. May be undefined if the error occurred before the value was processed. */
    value?: ValueType;
};

export type BodyguardSuccess<ValueType = JSONLike> = {
    success: true;
    value: ValueType;
};

export type BodyguardResult<
    ValueType = JSONLike,
    ErrorType = GenericError,
> = BodyguardSuccess<ValueType> | BodyguardError<ErrorType, ValueType>;

export type ContentType = {
    /** The media type in lowercase, e.g. `multipart/form-data` */
    type: string;
    /** The parameters by lowercase name, without their quotes, e.g. `{ boundary: "abc" }` */
    parameters: Record<string, string>;
};

/**
 * Utility functions
 */  

/**
 * Split a Content-Type header into its media type and its parameters. Media types and parameter names
 * are case-insensitive, so both come back in lowercase. A quoted value comes back without its quotes.
 * Of a parameter given twice the first is kept, as browsers and proxies do, so that everyone on the way
 * reads a body by the same boundary.
 * @param {string} header - The header value, e.g. `application/x-www-form-urlencoded;charset=UTF-8`
 * @returns {ContentType} - The media type and its parameters
 */
export function parseContentType(header: string): ContentType {
    const [type, ...rest] = header.split(';');
    const parameters: Record<string, string> = Object.create(null);
    for (const parameter of rest) {
        const at = parameter.indexOf('=');
        if(at === -1) continue;
        const name = parameter.slice(0, at).trim().toLowerCase();
        if(name in parameters) continue;
        const value = parameter.slice(at + 1).trim();
        const quoted = value.length > 1 && value.startsWith('"') && value.endsWith('"');
        parameters[name] = quoted ? value.slice(1, -1) : value;
    }
    return { type: type.trim().toLowerCase(), parameters };
}

/**
 * Create a byte stream counter. This is a transform stream that counts the number of bytes. If the number of bytes exceeds the maxSize, it will throw an error,
 * which the reader of the piped stream gets from its next read.
 * @param {number} maxSize - The maximum number of bytes
 * @returns {TransformStream<Uint8Array>} - The transform stream
 */
export function createByteStreamCounter(maxSize: number) {
    let bytes = 0;
    return new TransformStream<Uint8Array>({
        transform(chunk, controller) {
            bytes += chunk.length;
            if(bytes > maxSize) throw new Error(ERRORS.MAX_SIZE_EXCEEDED);
            controller.enqueue(chunk);
        }
    });
}

/**
 * Stop reading a body that has been refused, so its source is let go of. A stream that has failed by
 * itself rejects the cancel with its own error, which must not replace the error being thrown.
 * @param {{ cancel(): Promise<void> }} source - The reader or the stream to cancel
 */
export async function cancelQuietly(source: { cancel(): Promise<void> }) {
    try {
        await source.cancel();
    } catch {
        // The stream had failed already
    }
}

const PLUS = 0x2b;
const PERCENT = 0x25;
const SPACE = 0x20;

const encoder = new TextEncoder();

/** Keeps a byte order mark in the output, as the URL Standard's form parser does. */
const formDecoder = new TextDecoder("utf-8", { ignoreBOM: true });

/**
 * The value of an ASCII hex digit.
 * @param {number} byte - The byte to read
 * @returns {number} - 0 to 15, or -1 when the byte is not a hex digit
 */
function hexValue(byte: number): number {
    if(byte >= 0x30 && byte <= 0x39) return byte - 0x30;
    if(byte >= 0x41 && byte <= 0x46) return byte - 0x41 + 10;
    if(byte >= 0x61 && byte <= 0x66) return byte - 0x61 + 10;
    return -1;
}

/**
 * Decode a name or a value of an `application/x-www-form-urlencoded` body the way the URL Standard does:
 * a plus sign is a space, `%XX` is a byte, and the bytes are UTF-8. The plus sign is read before the
 * percent escapes, so a `%2B` stays a plus sign. A percent sign without two hex digits after it is kept
 * as it is, and bytes that are not UTF-8 become U+FFFD, so malformed input never throws.
 * @param {string | ArrayLike<number>} input - The raw name or value, as bytes or as the string they spell
 * @param {boolean} plusAsSpace - Whether a plus sign decodes to a space
 * @returns {string} - The decoded string
 */
export function decodeFormComponent(input: string | ArrayLike<number>, plusAsSpace: boolean = true): string {
    const bytes = typeof input === 'string' ? encoder.encode(input) : input;
    const decoded = new Uint8Array(bytes.length);
    let length = 0;
    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i];
        const high = byte === PERCENT && i + 2 < bytes.length ? hexValue(bytes[i + 1]) : -1;
        const low = high !== -1 ? hexValue(bytes[i + 2]) : -1;
        if(low !== -1) {
            decoded[length++] = high * 16 + low;
            i += 2;
        } else {
            decoded[length++] = byte === PLUS && plusAsSpace ? SPACE : byte;
        }
    }
    return formDecoder.decode(decoded.subarray(0, length));
}

/**
 * Write text as a byte string: its UTF-8 bytes, one character each. A `Headers` object takes no character
 * above U+00FF, and a field or a file may be named in any script.
 * @param {string} value - The text to write
 * @returns {string} - The byte string
 */
export function toByteString(value: string): string {
    let result = '';
    for (const byte of encoder.encode(value)) result += String.fromCharCode(byte);
    return result;
}

/**
 * Read text back from a byte string written by `toByteString`.
 * @param {string} value - The byte string
 * @returns {string} - The text
 */
export function fromByteString(value: string): string {
    return new TextDecoder().decode(Uint8Array.from(value, (char) => char.charCodeAt(0)));
}

/**
 * A stream that hands over the given bytes and ends.
 * @param {Uint8Array} bytes - The bytes to hand over
 * @returns {ReadableStream<Uint8Array>} - The stream
 */
export function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
    return new ReadableStream<Uint8Array>({
        start(controller) {
            controller.enqueue(bytes);
            controller.close();
        }
    });
}

/**
 * Join byte slices into one array.
 * @param {Uint8Array[]} slices - The slices, in order
 * @returns {Uint8Array} - The joined bytes
 */
export function concatBytes(slices: Uint8Array[]): Uint8Array {
    if(slices.length === 1) return slices[0];
    const joined = new Uint8Array(slices.reduce((length, slice) => length + slice.length, 0));
    let offset = 0;
    for (const slice of slices) {
        joined.set(slice, offset);
        offset += slice.length;
    }
    return joined;
}

/**
 * Possible cast a value to a number or boolean if it matches the criteria.
 * @param {string} value - The value to cast
 * @param {BodyguardConfig | BodyguardFormConfig} config - The configuration
 * @returns {string | number | boolean} - The casted value
 */
export function possibleCast(value: string, config: BodyguardConfig | BodyguardFormConfig) {
    if(value.trim() === '') return value;
    if(!isNaN(Number(value)) && config.castNumbers) return Number(value);
    if(value === 'true' && config.castBooleans) return true;
    if(value === 'false' && config.castBooleans) return false;
    return value;
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Returns true when a form-key segment is refused to prevent prototype pollution.
 * @param {string} key - A path segment name (without any `[index]` suffix)
 * @returns {boolean} Whether the key is forbidden
 */
function isForbiddenKey(key: string): boolean {
    return FORBIDDEN_KEYS.has(key);
}

/** A path segment: a name, then an optional `[]` or `[3]` */
const SEGMENT = /^([^\[\]]+)(?:\[(\d*)\])?$/;

/** What a value is to the key grammar: a list, an object a path may continue into, or a leaf */
type Kind = 'list' | 'branch' | 'leaf';

/**
 * Split a path segment into its name and its index.
 * @param {string} segment - A path segment such as `tags`, `tags[]` or `tags[3]`
 * @param {string[]} path - The path the segment belongs to, for the error message
 * @returns {{ key: string, index?: string }} - The name, and the index when the segment has brackets (`''` for `[]`)
 * @throws {Error} - If the segment is malformed or names a forbidden key
 */
function parseSegment(segment: string, path: string[]): { key: string; index?: string } {
    const match = segment.match(SEGMENT);
    if(!match || !match[1]) throw new Error("Invalid segment encountered in segment: " + segment + " of path: " + path.join('.'));
    if(isForbiddenKey(match[1])) throw new Error(ERRORS.INVALID_INPUT);
    return { key: match[1], index: match[2] };
}

/**
 * Whether a value is an object that a path may continue into. A File, or any other class instance, is a leaf.
 * @param {unknown} value - The value to check
 * @returns {boolean} - Whether the value is a plain object
 */
function isBranch(value: unknown): value is Record<string, any> {
    return typeof value === 'object' && value !== null && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Tell what a value is to the key grammar.
 * @param {unknown} value - The value to check
 * @returns {Kind} - `list` for an array, `branch` for a plain object, `leaf` for anything else
 */
function kindOf(value: unknown): Kind {
    if(Array.isArray(value)) return 'list';
    return isBranch(value) ? 'branch' : 'leaf';
}

/**
 * Refuse a key that needs one kind of value in a place where an earlier key left another.
 * @param {unknown} existing - What earlier keys left in the place, if anything
 * @param {Kind} kind - What the current key needs there
 * @throws {Error} - If the place is taken by another kind of value
 */
function expectKind(existing: unknown, kind: Kind) {
    if(existing !== undefined && kindOf(existing) !== kind) throw new Error(ERRORS.KEY_CONFLICT);
}

/**
 * Read a property that the object holds itself. Every object answers to names such as `toString` through
 * its prototype, and a path must never continue into those: `toString.call=x` would write on a built-in
 * that the whole process shares.
 * @param {Record<string, any>} node - The object to read from
 * @param {string} key - The property name
 * @returns {any} - The value, or undefined when the object has no such property of its own
 */
function own(node: Record<string, any>, key: string): any {
    return Object.hasOwn(node, key) ? node[key] : undefined;
}

/**
 * Whether an object already has a value where the rest of a path leads. A plain name counts, and so does
 * `name[3]` once that index is filled. A `[]` is never held, as a list takes any number of values.
 * @param {Record<string, any>} node - The object to look in
 * @param {string[]} path - The remaining segments of a path
 * @returns {boolean} - Whether the rest of the path is already set
 */
function holds(node: Record<string, any>, path: string[]): boolean {
    let current: unknown = node;
    for (const segment of path) {
        const match = segment.match(SEGMENT);
        if(!match || match[2] === '' || !isBranch(current)) return false;
        current = own(current, match[1]);
        if(match[2] !== undefined) current = Array.isArray(current) ? current[Number(match[2])] : undefined;
        if(current === undefined) return false;
    }
    return true;
}

/**
 * Assign a nested value to an object.
 *
 * Keys may meet in one place when they agree on what it is: a repeated plain name keeps the last value,
 * a list takes more values and an object takes more keys. A key that contradicts what earlier keys built
 * is refused, as `a=1` followed by `a.b=2` asks for `a` to be a string and an object.
 *
 * A `[]` before the end of a path (`rows[].name`) continues the item being built until a key comes that
 * the item already holds, which starts the next item: `rows[].name=a&rows[].age=1&rows[].name=b` is two
 * rows. Nothing marks the start of an item whose first field may be absent or is itself a `[]` list, such
 * as a row that begins with a checkbox, so those need explicit indices.
 * @param {Record<string, any>} obj - The object to assign to
 * @param {string[]} path - The path to assign to
 * @param {any} value - The value to assign
 * @param {number} maxLength - The longest a list may become through an explicit index
 * @throws {Error} - If a segment is malformed or forbidden, the key contradicts an earlier one, or an index is too large
 */
export function assignNestedValue(obj: Record<string, any>, path: string[], value: any, maxLength: number = MAX_KEYS) {
    let current = obj;
    for (let i = 0; i < path.length; i++) {
        const { key, index } = parseSegment(path[i], path);
        const last = i === path.length - 1;
        const existing = own(current, key);

        if(index === undefined) {
            if(last) {
                expectKind(existing, kindOf(value));
                current[key] = value;
            } else {
                expectKind(existing, 'branch');
                current = existing ?? (current[key] = {});
            }
            continue;
        }

        expectKind(existing, 'list');
        const list: any[] = existing ?? (current[key] = []);

        if(index === '') {
            const item = list[list.length - 1];
            if(last) list.push(value);
            else if(isBranch(item) && !holds(item, path.slice(i + 1))) current = item;
            else list.push(current = {});
        } else {
            const at = Number(index);
            if(at >= maxLength) throw new Error(ERRORS.INDEX_TOO_LARGE);
            if(last) {
                expectKind(list[at], kindOf(value));
                list[at] = value;
            } else {
                expectKind(list[at], 'branch');
                current = list[at] ?? (list[at] = {});
            }
        }
    }
}

/**
 * The longest list an explicit index may build. A body of at most `maxKeys` keys cannot honestly fill a
 * longer one, while an index without a bound (`a[4294967294]=x`) costs whoever reads the result.
 * @param {BodyguardConfig} config - The configuration
 * @returns {number} - `maxKeys`, or the default when `maxKeys` is not finite
 */
export function maxListLength(config: BodyguardConfig): number {
    return Number.isFinite(config.maxKeys) ? config.maxKeys : MAX_KEYS;
}

/**
 * The depth of the value that a key path builds: a level for each segment, and one more for a segment
 * with brackets, as a list is a level of its own. `items[0].name` is 3 deep, and so is the same value
 * in JSON: an object, a list, an object.
 * @param {string[]} path - The segments of a key
 * @returns {number} - The depth
 */
export function pathDepth(path: string[]): number {
    return path.reduce((depth, segment) => depth + (segment.includes('[') ? 2 : 1), 0);
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
