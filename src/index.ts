import { BodyValidator, ERRORS, JSONLike, MAX_DEPTH, MAX_KEYS, MAX_KEY_LENGTH, MAX_SIZE, ParserConfig, ParserError, ParserResult, ParserSuccess } from "./lib.js";
import { FormDataParser, JSONParser, URLParamsParser } from "./parser.js";

export type BodyguardConfig = ParserConfig & {
    validator?: BodyValidator;
}

export class Bodyguard {

    config: BodyguardConfig;
    validator?: BodyValidator;

    /**
     * Constructs a Bodyguard instance with the provided configuration or defaults to preset values.
     * @param {BodyguardConfig} config - Configuration settings to initialize the Bodyguard instance.
     * @param {number} config.maxKeys - Maximum number of keys.
     * @param {number} config.maxDepth - Maximum depth of an object or array.
     * @param {number} config.maxSize - Maximum size of a Request or Response body in bytes.
     * @param {number} config.maxKeyLength - Maximum length of a key in characters.
     * @example
     * const bodyguard = new Bodyguard({
     *     maxKeys: 100, // Maximum number of keys.
     *     maxDepth: 10, // Maximum depth of an object or array.
     *     maxSize: 1024 * 1024, // Maximum size of a Request or Response body in bytes.
     *     maxKeyLength: 100, // Maximum length of a key in characters.
     *     validate: (obj, schema) => ({ success: true, value: obj }
     * });
     */
    constructor(config: Partial<BodyguardConfig> = {
        maxKeys: MAX_KEYS,
        maxDepth: MAX_DEPTH,
        maxSize: MAX_SIZE,
        maxKeyLength: MAX_KEY_LENGTH,
    }) {

        this.config = {
            maxKeys: config.maxKeys && typeof config.maxKeys === 'number' && config.maxKeys > 0 ? config.maxKeys : MAX_KEYS,
            maxDepth: config.maxDepth && typeof config.maxDepth === 'number' && config.maxDepth > 0 ? config.maxDepth : MAX_DEPTH,
            maxSize: config.maxSize && typeof config.maxSize === 'number' && config.maxSize > 0 ? config.maxSize : MAX_SIZE,
            maxKeyLength: config.maxKeyLength && typeof config.maxKeyLength === 'number' && config.maxKeyLength > 0 ? config.maxKeyLength : MAX_KEY_LENGTH,
            castBooleans: config.castBooleans !== undefined && typeof config.castBooleans === 'boolean' ? config.castBooleans : false,
            castNumbers: config.castNumbers !== undefined && typeof config.castNumbers === 'boolean' ? config.castNumbers : true,
        };

        if(typeof config.validator === 'function') {
            this.validator = config.validator;
        }

    }

    /**
     * Attempts to parse a form from a Request or Response. Returns the parsed object in case of success and 
     * an error object in case of failure.
     * @template T - Type parameter for the schema to be validated against.
     * @param {Request | Response} input - Request or Response to parse the form from.
     * @param {T} schema - Optional schema to validate the parsed form against.
     * @return {Promise<ParserResult<T>>} - Result of the parsing operation.
     */
    async softForm<T>(input: Request | Response, schema?: T, config?: Partial<BodyguardConfig>): Promise<ParserResult<T>> {
        try {
            const res = await this.form(input, schema, config);
            return {
                success: true,
                value: res
            }
        }
        catch(e: any) {
            return {
                success: false,
                error: typeof e === 'string' ? e : e?.message || ""
            }
        }
    }

    /**
     * Attempts to parse JSON from a Request or Response. Returns the parsed JSON in case of success and 
     * an error object in case of failure.
     * @template T - Type parameter for the schema to be validated against.
     * @param {Request | Response} input - Request or Response to parse the JSON from.
     * @param {T} schema - Optional schema to validate the parsed JSON against.
     * @return {Promise<ParserResult<T>>} - Result of the parsing operation.
     */
    async softJson<T>(input: Request | Response, schema?: T, config?: Partial<BodyguardConfig>): Promise<ParserResult<T>> {
        try {
            const res = await this.json(input, schema, config);
            return {
                success: true,
                value: res
            }
        }
        catch(e: any) {
            return {
                success: false,
                error: typeof e === 'string' ? e : e?.message || ""
            }
        }
    }
    
    /**
     * Parses a form from a Request or Response. Form could be urlencoded or multipart.
     * @template T - Type parameter for the schema to be validated against.
     * @param {Request | Response} input - Request or Response to parse the form from.
     * @param {T} schema - Optional schema to validate the parsed form against.
     * @return {Promise<T>} - Parsed form from the Request or Response.
     * @throws {Error} - If content-type is not present or is invalid, or the form data is invalid, it throws an error.
     */
    async form<T>(input: Request | Response, schema?: T, config?: Partial<BodyguardConfig>): Promise<T> {
        if(input.body === null) throw new Error(ERRORS.BODY_NOT_AVAILABLE);
        config = this.constructConfig(config || {});

        const contentType = input.headers.get("content-type");
        if (!contentType || contentType === '') throw new Error(ERRORS.NO_CONTENT_TYPE);

        const bodyType = contentType === "application/x-www-form-urlencoded" ? "params" : "formdata";

        let boundary = "";
        if(contentType.includes("boundary")) {
            const match = contentType.match(/boundary=(.*)/);
            if (!match || !match[1]) {
                throw new Error(ERRORS.INVALID_CONTENT_TYPE);
            }
            boundary = match[1];
        }

        if(bodyType === "formdata" && !boundary) throw new Error(ERRORS.INVALID_CONTENT_TYPE);

        const parser = bodyType === "params" ? new URLParamsParser(config as ParserConfig) : new FormDataParser(config as ParserConfig, boundary);
        const ret = await parser.parse(input.body);

        return await this.maybeValidate(ret, config as BodyguardConfig, schema) as T;
    }

    /**
     * Parses JSON from a Request or Response.
     * @template T - Type parameter for the schema to be validated against.
     * @param {Request | Response} input - Request or Response to parse the JSON from.
     * @param {T} schema - Optional schema to validate the parsed JSON against.
     * @return {Promise<T>} - Parsed JSON from the Request or Response.
     * @throws {Error} - If JSON parsing fails, it throws an error.
     */
    async json<T>(input: Request | Response, schema?: T, config?: Partial<BodyguardConfig>): Promise<T> {
        if(input.body === null) throw new Error(ERRORS.BODY_NOT_AVAILABLE);
        config = this.constructConfig(config || {});

        const parser = new JSONParser(config as ParserConfig);
        const ret = await parser.parse(input.body);

        return await this.maybeValidate(ret, config as BodyguardConfig, schema) as T;
    }

    private constructConfig(config?: Partial<BodyguardConfig>): BodyguardConfig {
        return {
            maxKeys: config?.maxKeys && typeof config.maxKeys === 'number' && config.maxKeys > 0 ? config.maxKeys : this.config.maxKeys,
            maxDepth: config?.maxDepth && typeof config.maxDepth === 'number' && config.maxDepth > 0 ? config.maxDepth : this.config.maxDepth,
            maxSize: config?.maxSize && typeof config.maxSize === 'number' && config.maxSize > 0 ? config.maxSize : this.config.maxSize,
            maxKeyLength: config?.maxKeyLength && typeof config.maxKeyLength === 'number' && config.maxKeyLength > 0 ? config.maxKeyLength : this.config.maxKeyLength,
            castBooleans: config?.castBooleans !== undefined && typeof config.castBooleans === 'boolean' ? config.castBooleans : this.config.castBooleans,
            castNumbers: config?.castNumbers !== undefined && typeof config.castNumbers === 'boolean' ? config.castNumbers : this.config.castNumbers,
            validator: config?.validator || this.validator
        };
    }

    private async maybeValidate(obj: JSONLike, config: BodyguardConfig, schema?: any): Promise<JSONLike> {
        if(config.validator) {
            await Promise.resolve(config.validator(obj, schema));
        }
        return obj;
    }

}
