import { JSONParser as JSONStreamingParser, TokenType } from '@streamparser/json';
import { ERRORS, ParserConfig, type JsonPrimitive, type JsonStruct, extractNestedKey, createByteStreamCounter, getPossibleNumber, assignNestedValue } from './lib.js';
import parseMultipartMessage, { TMultipartMessageGenerator } from '@exact-realty/multipart-parser';

export type State = 'START' | 'KEY' | 'VALUE';

export interface Parser {
    config: ParserConfig;
    depth: number;
    keyCount: number;
    parse(stream: ReadableStream<Uint8Array>): Promise<JsonPrimitive | JsonStruct>;
}

export class JSONParser implements Parser {

    config: ParserConfig;
    depth = 0;
    keyCount = 0;

    constructor(config: ParserConfig) {
        this.config = config;
    }

    async parse(stream: ReadableStream<Uint8Array>): Promise<JsonPrimitive | JsonStruct> {
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
                if(key === '__proto__') return;
                if(key && typeof key === "string" && key.length > this.config.maxKeyLength) reject(new Error(ERRORS.KEY_TOO_LONG));
                if (stack.length > 0) return;
                resolve(value);
            };

            jsonparser.onError = (error) => {
                reject(new Error(ERRORS.INVALID_JSON));
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

    config: ParserConfig;
    depth = 0;
    keyCount = 0;

    private state: State = 'KEY';
    private currentKey = "";
    private currentValue = "";

    private EQUALS = '='.charCodeAt(0);
    private AMPERSAND = '&'.charCodeAt(0);

    constructor(config: ParserConfig) {
        this.config = config;
    }

    async parse(stream: ReadableStream<Uint8Array>): Promise<Record<string, any>> {

        const obj: Record<string, any> = {};
        const byteStreamCounter = createByteStreamCounter(stream, this.config.maxSize);

        for await (const part of this.parseStream(stream.pipeThrough(byteStreamCounter))) {
            if(part.keyCount > this.config.maxKeys) throw new Error(ERRORS.TOO_MANY_KEYS);
            const path = extractNestedKey(part.key);
            if(path[0] === "__proto__") continue;
            if(path.length > this.config.maxDepth) throw new Error(ERRORS.TOO_DEEP);
            assignNestedValue(
                obj,
                path,
                getPossibleNumber(
                    decodeURIComponent(part.value)
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

    config: ParserConfig;
    depth = 0;
    keyCount = 0;

    private boundary = '';

    constructor(config: ParserConfig, boundary: string) {
        this.config = config;
        this.boundary = boundary;
    }

    async parse(stream: ReadableStream<Uint8Array>) {
            
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

                this.keyCount++;
                if(this.keyCount >= this.config.maxKeys) throw new Error(ERRORS.TOO_MANY_KEYS);

                const match = key.match(/name="(.*)"/);
                if(!match || !match[1] || match[1] === '' || match[1] === '__proto__') continue;

                const keyName = match[1];
                let body: string | number | boolean | Record<string, any> = '';

                if(part.parts) {
                    body = await inner(part.parts);
                } else {
                    body = part.body ? getPossibleNumber(decoder.decode(part.body)) : '';
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
