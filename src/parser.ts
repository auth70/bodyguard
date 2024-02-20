import { JSONParser as JSONStreamingParser, TokenType } from '@streamparser/json';
import { ERRORS, extractNestedKey, createByteStreamCounter, assignNestedValue, possibleCast } from './lib.js';
import type { BodyguardConfig, BodyguardFormConfig, JSONLike, State } from './lib.js';
import parseMultipartMessage, { TMultipartMessageGenerator } from '@exact-realty/multipart-parser';

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
        return new Promise(async (resolve, reject) => {

            const decoder = new TextDecoder();
            let result = '';
            const byteStreamCounter = createByteStreamCounter(stream, this.config.maxSize, reject);
            const reader = stream.pipeThrough(byteStreamCounter).getReader();

            while(true) {
                const { done, value } = await reader.read();
                if (done) break;
                result += decoder.decode(value);
            }

            resolve(result);

        });
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
        return new Promise(async (resolve, reject) => {

            const jsonparser = new JSONStreamingParser();

            jsonparser.onToken = ({ token, value, offset }) => {
                if(token === TokenType.COLON) {
                    this.keyCount++;
                    if(this.keyCount > this.config.maxKeys) {
                        reject(new Error(ERRORS.TOO_MANY_KEYS));
                    }
                } else if(token === TokenType.LEFT_BRACE || token === TokenType.LEFT_BRACKET) {
                    this.depth++;
                    if(this.depth > this.config.maxDepth) {
                        reject(new Error(ERRORS.TOO_DEEP));
                    }
                } else if(token === TokenType.RIGHT_BRACE || token === TokenType.RIGHT_BRACKET) {
                    this.depth--;
                }
            };
    
            jsonparser.onValue = ({ value, key, parent, stack }) => {
                if(key === '__proto__') reject(new Error(ERRORS.INVALID_INPUT));
                if(key && typeof key === "string" && key.length > this.config.maxKeyLength) reject(new Error(ERRORS.KEY_TOO_LONG));
                if (stack.length > 0) return;
                resolve(value as JSONLike);
            };

            jsonparser.onError = (error) => {
                reject(new Error(ERRORS.INVALID_INPUT));
            };

            const byteStreamCounter = createByteStreamCounter(stream, this.config.maxSize, reject);
            const reader = stream.pipeThrough(byteStreamCounter).getReader();
    
            while(true) {
                const { done, value } = await reader.read();
                if (done) break;
                jsonparser.write(value);
            }
    
        });
    }
}

export class URLParamsParser implements Parser {

    config: BodyguardConfig;
    depth = 0;
    keyCount = 0;

    private state: State = 'KEY';
    private currentKey = "";
    private currentValue = "";

    private EQUALS = '='.charCodeAt(0);
    private AMPERSAND = '&'.charCodeAt(0);

    constructor(config: BodyguardConfig) {
        this.config = config;
    }

    async parse(stream: ReadableStream<Uint8Array>): Promise<JSONLike> {

        const obj: Record<string, any> = {};
        const byteStreamCounter = createByteStreamCounter(stream, this.config.maxSize);

        for await (const part of this.parseStream(stream.pipeThrough(byteStreamCounter))) {
            if(!part.key || part.key === '') continue;
            if(part.keyCount > this.config.maxKeys) throw new Error(ERRORS.TOO_MANY_KEYS);
            if(part.key.length > this.config.maxKeyLength) throw new Error(ERRORS.KEY_TOO_LONG);
            const path = extractNestedKey(part.key);
            if(path.find(s => s === "__proto__")) throw new Error(ERRORS.INVALID_INPUT);
            if(path.length > this.config.maxDepth) throw new Error(ERRORS.TOO_DEEP);
            assignNestedValue(
                obj,
                path,
                possibleCast(
                    decodeURIComponent(part.value),
                    this.config
                )
            );
        }

        return obj;
    }

    async *parseStream(stream: ReadableStream<Uint8Array>) {
        const reader = stream.getReader();
        let done, value;

        while ({ done, value } = await reader.read(), !done) {
            if (!value) continue;

            for (const byte of value) {
                switch (this.state) {
                    case 'KEY':
                        if (byte === this.EQUALS) {
                            this.state = 'VALUE';
                        } else if (byte === this.AMPERSAND) {
                            this.keyCount++;
                            yield { key: this.currentKey, value: this.currentValue, keyCount: this.keyCount };
                            this.currentKey = "";
                            this.currentValue = "";
                        } else {
                            this.currentKey += String.fromCharCode(byte);
                        }
                        break;

                    case 'VALUE':
                        if (byte === this.AMPERSAND) {
                            this.state = 'KEY';
                            this.keyCount++;
                            yield { key: this.currentKey, value: this.currentValue, keyCount: this.keyCount };
                            this.currentKey = "";
                            this.currentValue = "";
                        } else {
                            this.currentValue += String.fromCharCode(byte);
                        }
                        break;
                }
            }
        }
        // Handle the last parameter, if there's any left
        if (this.currentKey || this.currentValue) {
            yield { key: this.currentKey, value: this.currentValue, keyCount: this.keyCount };
        }
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
        const byteStreamCounter = createByteStreamCounter(stream, this.config.maxSize);

        const result = parseMultipartMessage(stream.pipeThrough(byteStreamCounter), this.boundary);

        /**
         * Parse an incoming stream of multipart/form-data
         * @param {TMultipartMessageGenerator} result A generator that yields parts of the multipart/form-data
         * @returns {Promise<Record<string, any>>} A promise that resolves to a Map of the form-data
         */
        const inner = async(result: TMultipartMessageGenerator) => {
            let ret: Record<string, any> = {};
            this.depth++;
            if(this.depth >= this.config.maxDepth) throw new Error(ERRORS.TOO_DEEP);
            for await (const part of result) {

                const key = part.headers.get('content-disposition');
                if(!key || !key.startsWith('form-data')) continue;

                const contentType = part.headers.get('content-type') || 'text/plain';

                // Check if content type is allowed
                if(this.config.allowedContentTypes && !this.config.allowedContentTypes.includes(contentType)) throw new Error(ERRORS.INVALID_CONTENT_TYPE);

                this.keyCount++;
                if(this.keyCount >= this.config.maxKeys) throw new Error(ERRORS.TOO_MANY_KEYS);

                // Check if the part is a file
                const isFile = key.indexOf('; filename=') !== -1;

                // Check if the file count is exceeded
                if(isFile) this.fileCount++;
                if(this.fileCount >= this.config.maxFiles) throw new Error(ERRORS.TOO_MANY_FILES);

                // Extract the key name and the filename, if it's a file
                const match = !isFile ? key.match(/name="(.*)"/) : key.match(/name="(.*)"; filename="(.*)"/);

                // If the key name is not available, skip the part
                if(!match || !match[1] || match[1] === '') continue;

                const filename = match && match[2] ? match[2] : '';
                if(filename.length > this.config.maxFilenameLength) throw new Error(ERRORS.FILENAME_TOO_LONG);

                const keyName = match[1];

                if(keyName === '__proto__') throw new Error(ERRORS.INVALID_INPUT);
                if(keyName.length > this.config.maxKeyLength) throw new Error(ERRORS.KEY_TOO_LONG);
                let body: string | number | boolean | Record<string, any> = '';

                if(part.parts) {
                    body = await inner(part.parts);
                } else {
                    if(isFile) {
                        // If the part is a file, return an object with the filename and the content type
                        body = part.body ? new File([part.body], filename, { type: contentType }) : '';
                    } else {
                        body = part.body ? possibleCast(decoder.decode(part.body), this.config) : '';
                    }
                }

                const path = extractNestedKey(keyName);
                assignNestedValue(ret, path, body);

            }
            this.depth--;
            return ret;
        }

        const res = await inner(result);
        return res;

    }

}
