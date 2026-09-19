import { JSONParser as JSONStreamingParser, TokenType } from '@streamparser/json';
import { ERRORS, extractNestedKey, createByteStreamCounter, assignNestedValue, possibleCast, decodeFormComponent, concatBytes, maxListLength, cancelQuietly, parseContentType, toByteString, fromByteString, streamOf, pathDepth } from './lib.js';
import type { BodyguardConfig, BodyguardFormConfig, JSONLike, State } from './lib.js';
import parseMultipartMessage, { TMultipartMessageGenerator } from '@apeleghq/multipart-parser';

export interface Parser {
    config: BodyguardConfig;
    depth: number;
    keyCount: number;
    parse(stream: ReadableStream<Uint8Array>): Promise<JSONLike>;
}

export class TextParser implements Parser {

    config: BodyguardConfig;
    depth = 0;
    keyCount = 0;

    constructor(config: BodyguardConfig) {
        this.config = config;
    }

    async parse(stream: ReadableStream<Uint8Array>): Promise<JSONLike> {

        const decoder = new TextDecoder();
        let result = '';
        const byteStreamCounter = createByteStreamCounter(this.config.maxSize);
        const reader = stream.pipeThrough(byteStreamCounter).getReader();

        while(true) {
            const { done, value } = await reader.read();
            if (done) break;
            // A character may be split between two chunks
            result += decoder.decode(value, { stream: true });
        }

        return result + decoder.decode();
    }
}

export class JSONParser implements Parser {

    config: BodyguardConfig;
    depth = 0;
    keyCount = 0;

    constructor(config: BodyguardConfig) {
        this.config = config;
    }

    async parse(stream: ReadableStream<Uint8Array>): Promise<JSONLike> {

        const jsonparser = new JSONStreamingParser();

        // The parser reports through callbacks while a chunk is being written to it.
        // The first failure is kept, and thrown once the write has returned.
        let failure: Error | undefined;
        let result: { value: JSONLike } | undefined;
        const fail = (code: string) => { failure ??= new Error(code); };

        jsonparser.onToken = ({ token }) => {
            if(token === TokenType.COLON) {
                this.keyCount++;
                if(this.keyCount > this.config.maxKeys) fail(ERRORS.TOO_MANY_KEYS);
            } else if(token === TokenType.LEFT_BRACE || token === TokenType.LEFT_BRACKET) {
                this.depth++;
                if(this.depth > this.config.maxDepth) fail(ERRORS.TOO_DEEP);
            } else if(token === TokenType.RIGHT_BRACE || token === TokenType.RIGHT_BRACKET) {
                this.depth--;
            }
        };

        jsonparser.onValue = ({ value, key, stack }) => {
            if(key === '__proto__' || key === 'constructor' || key === 'prototype') fail(ERRORS.INVALID_INPUT);
            if(key && typeof key === "string" && key.length > this.config.maxKeyLength) fail(ERRORS.KEY_TOO_LONG);
            if (stack.length > 0) return;
            result = { value: value as JSONLike };
        };

        jsonparser.onError = () => fail(ERRORS.INVALID_INPUT);

        const byteStreamCounter = createByteStreamCounter(this.config.maxSize);
        const reader = stream.pipeThrough(byteStreamCounter).getReader();

        while(!failure) {
            const { done, value } = await reader.read();
            if (done) break;
            jsonparser.write(value);
        }

        // A number has no closing character, so the parser holds it until the input is over.
        // Ending the parser also fails a document that stops half-way. A whole document has
        // ended it already, and it reports being ended twice as an error.
        if(!failure && !jsonparser.isEnded) jsonparser.end();

        if(failure) {
            await cancelQuietly(reader);
            throw failure;
        }
        if(!result) throw new Error(ERRORS.INVALID_INPUT);

        return result.value;
    }
}

export class URLParamsParser implements Parser {

    config: BodyguardConfig;
    depth = 0;
    keyCount = 0;

    private state: State = 'KEY';
    private currentKey: Uint8Array[] = [];
    private currentValue: Uint8Array[] = [];

    private EQUALS = '='.charCodeAt(0);
    private AMPERSAND = '&'.charCodeAt(0);

    constructor(config: BodyguardConfig) {
        this.config = config;
    }

    async parse(stream: ReadableStream<Uint8Array>): Promise<JSONLike> {

        const obj: Record<string, any> = {};
        const byteStreamCounter = createByteStreamCounter(this.config.maxSize);
        const plusAsSpace = (this.config as BodyguardFormConfig).convertPluses !== false;

        for await (const pair of this.parseStream(stream.pipeThrough(byteStreamCounter))) {
            if(pair.key.length === 0) continue;
            this.keyCount++;
            if(this.keyCount > this.config.maxKeys) throw new Error(ERRORS.TOO_MANY_KEYS);
            const key = decodeFormComponent(pair.key, plusAsSpace);
            if(key.length > this.config.maxKeyLength) throw new Error(ERRORS.KEY_TOO_LONG);
            const path = extractNestedKey(key);
            if(path.find(s => s === "__proto__")) throw new Error(ERRORS.INVALID_INPUT);
            if(pathDepth(path) > this.config.maxDepth) throw new Error(ERRORS.TOO_DEEP);
            assignNestedValue(
                obj,
                path,
                possibleCast(
                    decodeFormComponent(pair.value, plusAsSpace),
                    this.config
                ),
                maxListLength(this.config)
            );
        }

        return obj;
    }

    /**
     * Split the body into its pairs. A name or a value stays raw bytes until its pair is whole,
     * as a percent escape may be one byte of a longer character, and either may span chunks.
     * @param {ReadableStream<Uint8Array>} stream - The urlencoded body
     * @yields {{ key: Uint8Array, value: Uint8Array }} The raw name and value of each pair
     */
    private async *parseStream(stream: ReadableStream<Uint8Array>) {
        const reader = stream.getReader();
        let done, value;

        try {
            while ({ done, value } = await reader.read(), !done) {
                if (!value) continue;

                let start = 0;
                for (let i = 0; i < value.length; i++) {
                    if (value[i] === this.AMPERSAND) {
                        this.collect(value.subarray(start, i));
                        yield this.takePair();
                        start = i + 1;
                    } else if (value[i] === this.EQUALS && this.state === 'KEY') {
                        this.collect(value.subarray(start, i));
                        this.state = 'VALUE';
                        start = i + 1;
                    }
                }
                // What is left of the chunk continues in the next one
                this.collect(value.subarray(start));
            }
            // Handle the last parameter, if there's any left
            if (this.currentKey.length || this.currentValue.length) {
                yield this.takePair();
            }
        } finally {
            // Reached before the end of the body when a pair was refused
            await cancelQuietly(reader);
        }
    }

    /**
     * Keep a slice of the current chunk for the name or the value being read.
     * @param {Uint8Array} slice - The bytes read since the last `=` or `&`
     */
    private collect(slice: Uint8Array) {
        if (slice.length === 0) return;
        (this.state === 'KEY' ? this.currentKey : this.currentValue).push(slice);
    }

    /**
     * Hand over the pair read so far and start the next one.
     * @returns {{ key: Uint8Array, value: Uint8Array }} The raw name and value
     */
    private takePair() {
        const pair = { key: concatBytes(this.currentKey), value: concatBytes(this.currentValue) };
        this.state = 'KEY';
        this.currentKey = [];
        this.currentValue = [];
        return pair;
    }
}

export class FormDataParser implements Parser {

    config: BodyguardFormConfig;
    depth = 0;
    keyCount = 0;
    fileCount = 0;

    private boundary = '';

    constructor(config: BodyguardFormConfig, boundary: string) {
        this.config = config;
        this.boundary = boundary;
    }

    async parse(stream: ReadableStream<Uint8Array>): Promise<JSONLike> {
            
        const decoder = new TextDecoder();
        const byteStreamCounter = createByteStreamCounter(this.config.maxSize);
        const body = stream.pipeThrough(byteStreamCounter);

        const result = this.parts(body, this.boundary);

        /**
         * Parse an incoming stream of multipart/form-data
         * @param {TMultipartMessageGenerator} result A generator that yields parts of the multipart/form-data
         * @param {number} base The depth of the key that holds these parts, 0 for the body itself
         * @returns {Promise<Record<string, any>>} A promise that resolves to a Map of the form-data
         */
        const inner = async(result: TMultipartMessageGenerator, base: number) => {
            let ret: Record<string, any> = {};
            this.depth++;
            for await (const part of result) {

                const key = fromByteString(part.headers.get('content-disposition') || '');
                if(!key.startsWith('form-data')) continue;

                const contentType = fromByteString(part.headers.get('content-type') || '') || 'text/plain';
                const { type, parameters } = parseContentType(contentType);

                // Check if the part is a file
                const isFile = key.indexOf('; filename=') !== -1;

                // Extract the key name and the filename, if it's a file
                const match = !isFile ? key.match(/name="(.*)"/) : key.match(/name="(.*)"; filename="(.*)"/);

                // If the key name is not available, skip the part
                if(!match || !match[1] || match[1] === '') continue;

                // A part without a name is no key, as a pair without a name is none in a urlencoded body
                this.keyCount++;
                if(this.keyCount > this.config.maxKeys) throw new Error(ERRORS.TOO_MANY_KEYS);

                const filename = match && match[2] ? match[2] : '';
                if(filename.length > this.config.maxFilenameLength) throw new Error(ERRORS.FILENAME_TOO_LONG);

                // A file input left empty posts a part with no filename and no bytes. It comes back as the
                // empty File it is, but it is no file to count, or to hold against the allowed types.
                const chosen = isFile && !(filename === '' && !part.body?.length);

                if(chosen) {
                    // Check if the file count is exceeded
                    this.fileCount++;
                    if(this.fileCount > this.config.maxFiles) throw new Error(ERRORS.TOO_MANY_FILES);

                    // Check if content type is allowed
                    if(this.config.allowedContentTypes && !this.config.allowedContentTypes.includes(type)) throw new Error(ERRORS.INVALID_CONTENT_TYPE);
                }

                const keyName = match[1];

                if(keyName === '__proto__') throw new Error(ERRORS.INVALID_INPUT);
                if(keyName.length > this.config.maxKeyLength) throw new Error(ERRORS.KEY_TOO_LONG);
                const path = extractNestedKey(keyName);
                const depth = base + pathDepth(path);
                if(depth > this.config.maxDepth) throw new Error(ERRORS.TOO_DEEP);

                let body: string | number | boolean | Record<string, any> = '';

                // A part may be a multipart body of its own. It is read here rather than through `part.parts`,
                // whose headers the multipart parser builds without the transform given to `this.parts`.
                if(part.body && type.startsWith('multipart/') && parameters.boundary) {
                    body = await inner(this.parts(streamOf(part.body), parameters.boundary), depth);
                } else {
                    if(isFile) {
                        // If the part is a file, return an object with the filename and the content type
                        body = part.body ? new File([new Uint8Array(part.body)], filename, { type: contentType }) : '';
                    } else {
                        body = part.body ? possibleCast(decoder.decode(part.body), this.config) : '';
                    }
                }

                assignNestedValue(ret, path, body, maxListLength(this.config));

            }
            this.depth--;
            return ret;
        }

        try {
            return await inner(result, 0);
        } catch(e: unknown) {
            // Leaving the loop over the parts has released the body, which can now be let go of
            await cancelQuietly(body);
            throw e;
        }

    }

    /**
     * Read the parts of a multipart body. The parts come with a `Headers` object, which takes no character
     * above U+00FF, so the header values are kept as byte strings and read back with `fromByteString`.
     * @param {ReadableStream<Uint8Array>} stream - The multipart body
     * @param {string} boundary - The boundary between its parts
     * @returns {TMultipartMessageGenerator} A generator that yields the parts
     */
    private parts(stream: ReadableStream<Uint8Array>, boundary: string): TMultipartMessageGenerator {
        // The parser's types name ArrayBuffer chunks, and its code takes views of them as well
        return parseMultipartMessage(stream as ReadableStream<any>, boundary, (headers) => new Headers(headers.map(([name, value]) => [name, toByteString(value)])));
    }

}
