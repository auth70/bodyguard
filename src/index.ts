import type { BodyguardValidator, JSONLike, BodyguardConfig, BodyguardError, BodyguardResult, BodyguardSuccess, BodyguardFormConfig } from "./lib.js";
import { ERRORS, MAX_DEPTH, MAX_KEYS, MAX_KEY_LENGTH, MAX_SIZE } from "./lib.js";
import { FormDataParser, JSONParser, TextParser, URLParamsParser } from "./parser.js";

export type { BodyguardError, BodyguardResult, BodyguardSuccess, BodyguardConfig, BodyguardValidator, JSONLike };
export { ERRORS, MAX_DEPTH, MAX_KEYS, MAX_KEY_LENGTH, MAX_SIZE, FormDataParser, JSONParser, TextParser, URLParamsParser};

export class Bodyguard {

    config: BodyguardConfig | BodyguardFormConfig;

    /**
     * Constructs a Bodyguard instance with the provided configuration or defaults to preset values.
     * @param {BodyguardConfig} config - Configuration settings to initialize the Bodyguard instance.
     * @param {number} config.maxKeys - Maximum number of keys.
     * @param {number} config.maxDepth - Maximum depth of an object or array.
     * @param {number} config.maxSize - Maximum size of a Request or Response body in bytes.
     * @param {number} config.maxKeyLength - Maximum length of a key in characters.
     * @param {boolean} config.castBooleans - Whether to cast boolean values to boolean type.
     * @param {boolean} config.castNumbers - Whether to cast numeric values to number type.
     * @param {boolean} config.convertPluses - Whether to convert plus signs to spaces in urlencoded form data.
     * @param {number} config.maxFiles - Maximum number of files; used only for multipart form data.
     * @param {number} config.maxFilenameLength - Maximum length of a filename; used only for multipart form data.
     * @param {string[]} config.allowedContentTypes - Allow list for content types; used only for multipart form data.
     * @example
     * const bodyguard = new Bodyguard({
     *     maxKeys: 100, // Maximum number of keys.
     *     maxDepth: 10, // Maximum depth of an object or array.
     *     maxSize: 1024 * 1024, // Maximum size of a Request or Response body in bytes.
     *     maxKeyLength: 100, // Maximum length of a key in characters.
     *     castBooleans: false, // Whether to cast boolean values to boolean type.
     *     castNumbers: false, // Whether to cast numeric values to number type.
     * });
     */
    constructor(config?: Partial<BodyguardConfig | BodyguardFormConfig>) {
        this.config = {
            maxKeys: config?.maxKeys && typeof config.maxKeys === 'number' && config.maxKeys > 0 ? config.maxKeys : MAX_KEYS,
            maxDepth: config?.maxDepth && typeof config.maxDepth === 'number' && config.maxDepth > 0 ? config.maxDepth : MAX_DEPTH,
            maxSize: config?.maxSize && typeof config.maxSize === 'number' && config.maxSize > 0 ? config.maxSize : MAX_SIZE,
            maxKeyLength: config?.maxKeyLength && typeof config.maxKeyLength === 'number' && config.maxKeyLength > 0 ? config.maxKeyLength : MAX_KEY_LENGTH,
            castBooleans: config?.castBooleans !== undefined && typeof config.castBooleans === 'boolean' ? config.castBooleans : false,
            castNumbers: config?.castNumbers !== undefined && typeof config.castNumbers === 'boolean' ? config.castNumbers : false,
            convertPluses: (config as Partial<BodyguardFormConfig>)?.convertPluses !== undefined && typeof (config as Partial<BodyguardFormConfig>).convertPluses === 'boolean' ? (config as Partial<BodyguardFormConfig>).convertPluses : false,
            maxFiles: typeof (config as Partial<BodyguardFormConfig>)?.maxFiles === 'number' && (config as Partial<BodyguardFormConfig>).maxFiles! > -1 ? (config as Partial<BodyguardFormConfig>).maxFiles : Infinity,
            maxFilenameLength: typeof (config as Partial<BodyguardFormConfig>)?.maxFilenameLength === 'number' && (config as Partial<BodyguardFormConfig>).maxFilenameLength! > 0 ? (config as Partial<BodyguardFormConfig>).maxFilenameLength : 255,
            allowedContentTypes: (config as Partial<BodyguardFormConfig>)?.allowedContentTypes && Array.isArray((config as Partial<BodyguardFormConfig>).allowedContentTypes) ? (config as Partial<BodyguardFormConfig>).allowedContentTypes : undefined,
        };
    }

    /**
     * Attempts to parse a Request or Response body. Returns the parsed object in case of success and
     * an error object in case of failure.
     * @param {Request | Response} input - Request or Response to parse the body from.
     * @param {BodyguardValidator} validator - Optional validator to validate the parsed body against.
     * @param {Partial<BodyguardConfig | BodyguardFormConfig>} config - Optional configuration to override the default configuration.
     * @returns {Promise<BodyguardResult<K>>} - Result of the parsing operation.
     */
    async softPat<
        T extends BodyguardValidator,
        K extends JSONLike = T extends BodyguardValidator ? ReturnType<T> : JSONLike,
    > (
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig | BodyguardFormConfig>
    ): Promise<BodyguardResult<K>> {
        try {
            const res = await this.pat(input, validator, config);
            return {
                success: true,
                value: res as K
            }
        } catch(e: any) {
            return {
                success: false,
                error: e
            }
        }
    }

    /**
     * Attempts to parse a Request or Response body. Returns the parsed object in case of success and
     * an error object in case of failure.
     * @param {Request | Response} input - Request or Response to parse the body from.
     * @param {BodyguardValidator} validator - Optional validator to validate the parsed body against.
     * @param {Partial<BodyguardConfig | BodyguardFormConfig>} config - Optional configuration to override the default configuration.
     * @returns {Promise<K>} - Result of the parsing operation.
     * @throws {Error} - If content-type is not present or is invalid, or the body is invalid, it throws an error.
     */
    async pat<
        T extends BodyguardValidator,
        K extends JSONLike = T extends BodyguardValidator ? ReturnType<T> : JSONLike
    > (
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig | BodyguardFormConfig>
    ): Promise<K> {
        const contentType = input.headers.get("content-type");
        if (!contentType || contentType === '') throw new Error(ERRORS.NO_CONTENT_TYPE);
        if (contentType === "application/x-www-form-urlencoded") {
            return await this.form(input, validator, config);
        } else if (contentType.startsWith("multipart/form-data")) {
            return await this.form(input, validator, config);
        } else if (contentType === "application/json") {
            return await this.json(input, validator, config);
        } else if (contentType === "text/plain") {
            return await this.text(input, validator, config);
        } else {
            throw new Error(ERRORS.INVALID_CONTENT_TYPE);
        }
    }

    /**
     * Attempts to parse a form from a Request or Response. Returns the parsed object in case of success and 
     * an error object in case of failure.
     * @param {Request | Response} input - Request or Response to parse the form from.
     * @param {BodyguardValidator} validator - Optional validator to validate the parsed form against.
     * @param {Partial<BodyguardFormConfig>} config - Optional configuration to override the default configuration.
     * @return {Promise<BodyguardResult<K>>} - Result of the parsing operation.
     */
    async softForm<
        T extends BodyguardValidator,
        K extends JSONLike = T extends BodyguardValidator ? ReturnType<T> : JSONLike
    > (
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardFormConfig>
    ): Promise<BodyguardResult<K>> {
        try {
            const res = await this.form(input, validator, config);
            return {
                success: true,
                value: res as K
            }
        } catch(e: any) {
            return {
                success: false,
                error: e
            }
        }
    }
    
    /**
     * Parses a form from a Request or Response. Form could be urlencoded or multipart.
     * @param {Request | Response} input - Request or Response to parse the form from.
     * @param {BodyguardValidator} validator - Optional validator to validate the parsed form against.
     * @param {Partial<BodyguardFormConfig>} config - Optional configuration to override the default configuration.
     * @return {Promise<K>} - Parsed form from the Request or Response.
     * @throws {Error} - If content-type is not present or is invalid, or the form data is invalid, it throws an error.
     */
    async form<
        T extends BodyguardValidator,
        K extends JSONLike = T extends BodyguardValidator ? ReturnType<T> : JSONLike
    > (
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardFormConfig>
    ): Promise<K> {
        if(!input.body) throw new Error(ERRORS.BODY_NOT_AVAILABLE);
        const instanceConfig = this.constructConfig(config || {});

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

        const parser = bodyType === "params" ? new URLParamsParser(instanceConfig) : new FormDataParser(instanceConfig as BodyguardFormConfig, boundary);
        const ret = await parser.parse(input.body);

        if(validator) {
            return await Promise.resolve(validator(ret)) as K;
        }

        return ret as K;

    }

    /**
     * Attempts to parse JSON from a Request or Response. Returns the parsed JSON in case of success and 
     * an error object in case of failure.
     * @param {Request | Response} input - Request or Response to parse the JSON from.
     * @param {BodyguardValidator} validator - Optional validator to validate the parsed JSON against.
     * @param {BodyguardConfig} config - Optional configuration to override the default configuration.
     * @return {Promise<BodyguardResult<K>>} - Result of the parsing operation.
     */
    async softJson<
        T extends BodyguardValidator,
        K extends JSONLike = T extends BodyguardValidator ? ReturnType<T> : JSONLike,
    > (
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig>
    ): Promise<BodyguardResult<K>> {
        try {
            const res = await this.json(input, validator, config);
            return {
                success: true,
                value: res as K
            }
        } catch(e: any) {
            return {
                success: false,
                error: e
            }
        }
    }

    /**
     * Parses JSON from a Request or Response.
     * @param {Request | Response} input - Request or Response to parse the JSON from.
     * @param {BodyguardValidator} validator - Optional validator to validate the parsed JSON against.
     * @param {BodyguardConfig} config - Optional configuration to override the default configuration.
     * @return {Promise<K>} - Parsed JSON from the Request or Response.
     * @throws {Error} - If JSON parsing fails, it throws an error.
     */
    async json<
        T extends BodyguardValidator,
        K extends JSONLike = T extends BodyguardValidator ? ReturnType<T> : JSONLike
    > (
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig>
    ): Promise<K> {

        if(!input.body) throw new Error(ERRORS.BODY_NOT_AVAILABLE);
        const instanceConfig = this.constructConfig(config || {});

        const parser = new JSONParser(instanceConfig);
        const ret = await parser.parse(input.body);

        if(validator) {
            return await Promise.resolve(validator(ret)) as K;
        }

        return ret as K;
    }

    /**
     * Attempts to parse text from a Request or Response. Returns the parsed text in case of success and
     * an error object in case of failure.
     * @param {Request | Response} input - Request or Response to parse the text from.
     * @param {BodyguardValidator} validator - Optional validator to validate the parsed text against.
     * @param {BodyguardConfig} config - Optional configuration to override the default configuration.
     * @returns {Promise<BodyguardResult<K>>} - Result of the parsing operation.
     */
    async softText<
        T extends BodyguardValidator,
        K extends JSONLike = T extends BodyguardValidator ? ReturnType<T> : string,
    >(
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig>
    ): Promise<BodyguardResult<K>> {
        try {
            const res = await this.text(input, validator, config);
            return {
                success: true,
                value: res as K
            }
        } catch(e: any) {
            return {
                success: false,
                error: e
            }
        }
    }

    /**
     * Parses text from a Request or Response.
     * @param {Request | Response} input - Request or Response to parse the text from.
     * @param {BodyguardValidator} validator - Optional validator to validate the parsed text against.
     * @param {BodyguardConfig} config - Optional configuration to override the default configuration.
     * @returns {Promise<K>} - Parsed text from the Request or Response.
     * @throws {Error} - If text parsing fails, it throws an error.
     */
    async text<
        T extends BodyguardValidator,
        K extends JSONLike = T extends BodyguardValidator ? ReturnType<T> : string
    >(
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig>
    ): Promise<K> {
        if(!input.body) throw new Error(ERRORS.BODY_NOT_AVAILABLE);
        const instanceConfig = this.constructConfig(config || {});
        const parser = new TextParser(instanceConfig);
        const ret = await parser.parse(input.body);
        if(validator) {
            return await Promise.resolve(validator(ret)) as K;
        }
        return ret as K;
    }

    private constructConfig(config?: Partial<BodyguardConfig | BodyguardFormConfig>): BodyguardConfig | BodyguardFormConfig {
        return {
            maxKeys: config?.maxKeys && typeof config.maxKeys === 'number' && config.maxKeys > 0 ? config.maxKeys : this.config.maxKeys,
            maxDepth: config?.maxDepth && typeof config.maxDepth === 'number' && config.maxDepth > 0 ? config.maxDepth : this.config.maxDepth,
            maxSize: config?.maxSize && typeof config.maxSize === 'number' && config.maxSize > 0 ? config.maxSize : this.config.maxSize,
            maxKeyLength: config?.maxKeyLength && typeof config.maxKeyLength === 'number' && config.maxKeyLength > 0 ? config.maxKeyLength : this.config.maxKeyLength,
            castBooleans: config?.castBooleans !== undefined && typeof config.castBooleans === 'boolean' ? config.castBooleans : this.config.castBooleans,
            castNumbers: config?.castNumbers !== undefined && typeof config.castNumbers === 'boolean' ? config.castNumbers : this.config.castNumbers,
            convertPluses: (config as Partial<BodyguardFormConfig>)?.convertPluses !== undefined && typeof (config as Partial<BodyguardFormConfig>).convertPluses === 'boolean' ? (config as Partial<BodyguardFormConfig>).convertPluses : false,
            maxFiles: typeof (config as Partial<BodyguardFormConfig>)?.maxFiles === 'number' && (config as Partial<BodyguardFormConfig>).maxFiles! > -1 ? (config as Partial<BodyguardFormConfig>).maxFiles : (this.config as BodyguardFormConfig).maxFiles,
            maxFilenameLength: typeof (config as Partial<BodyguardFormConfig>)?.maxFilenameLength === 'number' ? (config as Partial<BodyguardFormConfig>).maxFilenameLength : (this.config as BodyguardFormConfig).maxFilenameLength,
            allowedContentTypes: (config as Partial<BodyguardFormConfig>)?.allowedContentTypes && Array.isArray((config as Partial<BodyguardFormConfig>).allowedContentTypes) ? (config as Partial<BodyguardFormConfig>).allowedContentTypes : (this.config as BodyguardFormConfig).allowedContentTypes,
        };
    }

}
