import type { BodyguardValidator, JSONLike, BodyguardConfig, BodyguardError, BodyguardResult, BodyguardSuccess, BodyguardFormConfig, GenericIssue, GenericError, BodyguardAcceptedValidator, BodyguardValidatorOutput } from "./lib.js";
import { ERRORS, MAX_DEPTH, MAX_KEYS, MAX_KEY_LENGTH, MAX_SIZE, assignNestedValue, extractNestedKey, possibleCast } from "./lib.js";
import { FormDataParser, JSONParser, TextParser, URLParamsParser } from "./parser.js";
import type { StandardSchemaV1 } from "./standard.js";
import { isStandardSchema, standardIssueToGenericIssue } from "./standard.js";

export type { GenericIssue, GenericError, BodyguardError, BodyguardResult, BodyguardSuccess, BodyguardConfig, BodyguardFormConfig, BodyguardValidator, BodyguardAcceptedValidator, BodyguardValidatorOutput, JSONLike, StandardSchemaV1 };
export { ERRORS, MAX_DEPTH, MAX_KEYS, MAX_KEY_LENGTH, MAX_SIZE, FormDataParser, JSONParser, TextParser, URLParamsParser, assignNestedValue, extractNestedKey, possibleCast, isStandardSchema };

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
     * @param {function} [config.transform] - Optional transform applied after parsing and before validation.
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
            transform: typeof config?.transform === 'function' ? config.transform : undefined,
        };
    }

    /**
     * Apply an optional transform after parsing and before validation.
     * @param {JSONLike} value - Parsed body
     * @param {BodyguardConfig | BodyguardFormConfig} config - Merged configuration
     * @returns {Promise<JSONLike>} Transformed value, or the original value when no transform is set
     */
    private async applyTransform(value: JSONLike, config: BodyguardConfig | BodyguardFormConfig): Promise<JSONLike> {
        if (typeof config.transform !== 'function') return value;
        return await config.transform(value);
    }

    /**
     * Run a function validator or a Standard Schema v1 object against a parsed value.
     * @param {BodyguardAcceptedValidator} validator - Validator to apply
     * @param {JSONLike} value - Parsed (and possibly transformed) value
     * @returns {Promise<BodyguardValidatorOutput<T>>} Validator output
     */
    private async runValidator<T extends BodyguardAcceptedValidator>(
        validator: T,
        value: JSONLike
    ): Promise<BodyguardValidatorOutput<T>> {
        if (isStandardSchema(validator)) {
            const result = await validator["~standard"].validate(value);
            if (result.issues) {
                const issues = result.issues.map(standardIssueToGenericIssue);
                const error = new Error(issues[0]?.message ?? "Validation failed") as Error & { issues: GenericIssue[] };
                error.issues = issues;
                throw error;
            }
            return result.value as BodyguardValidatorOutput<T>;
        }
        return await Promise.resolve(validator(value)) as BodyguardValidatorOutput<T>;
    }

    /**
     * Attempts to parse a Request or Response body. Returns the parsed object in case of success and
     * an error object in case of failure.
     * @param {Request | Response} input - Request or Response to parse the body from.
     * @param {BodyguardAcceptedValidator} validator - Optional validator to validate the parsed body against.
     * @param {Partial<BodyguardConfig | BodyguardFormConfig>} config - Optional configuration to override the default configuration.
     * @returns {Promise<BodyguardResult<BodyguardValidatorOutput<T>, E>>} - Result of the parsing operation.
     */
    async softPat<T extends BodyguardAcceptedValidator | undefined = undefined, E = GenericError>(
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig | BodyguardFormConfig>
    ): Promise<BodyguardResult<BodyguardValidatorOutput<T>, E>> {
        const contentType = input.headers.get("content-type");
        if (!contentType || contentType === '') {
            return {
                success: false,
                error: new Error(ERRORS.NO_CONTENT_TYPE) as E
            };
        }
        if (contentType === "application/x-www-form-urlencoded") {
            return await this.softForm(input, validator, config);
        } else if (contentType.startsWith("multipart/form-data")) {
            return await this.softForm(input, validator, config);
        } else if (contentType === "application/json") {
            return await this.softJson(input, validator, config);
        } else if (contentType === "text/plain") {
            return await this.softText(input, validator, config) as BodyguardResult<BodyguardValidatorOutput<T>, E>;
        } else {
            return {
                success: false,
                error: new Error(ERRORS.INVALID_CONTENT_TYPE) as E
            };
        }
    }

    /**
     * Attempts to parse a Request or Response body. Returns the parsed object in case of success and
     * an error object in case of failure.
     * @param {Request | Response} input - Request or Response to parse the body from.
     * @param {BodyguardAcceptedValidator} validator - Optional validator to validate the parsed body against.
     * @param {Partial<BodyguardConfig | BodyguardFormConfig>} config - Optional configuration to override the default configuration.
     * @returns {Promise<BodyguardValidatorOutput<T>>} - Result of the parsing operation.
     * @throws {Error} - If content-type is not present or is invalid, or the body is invalid, it throws an error.
     */
    async pat<T extends BodyguardAcceptedValidator | undefined = undefined>(
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig | BodyguardFormConfig>
    ): Promise<BodyguardValidatorOutput<T>> {
        const contentType = input.headers.get("content-type");
        if (!contentType || contentType === '') throw new Error(ERRORS.NO_CONTENT_TYPE);
        if (contentType === "application/x-www-form-urlencoded") {
            return await this.form(input, validator, config);
        } else if (contentType.startsWith("multipart/form-data")) {
            return await this.form(input, validator, config);
        } else if (contentType === "application/json") {
            return await this.json(input, validator, config);
        } else if (contentType === "text/plain") {
            return await this.text(input, validator, config) as BodyguardValidatorOutput<T>;
        } else {
            throw new Error(ERRORS.INVALID_CONTENT_TYPE);
        }
    }

    private async formInternal<
        K extends JSONLike = JSONLike
    > (
        input: Request | Response,
        config?: Partial<BodyguardFormConfig>,
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

        return ret as K;
    }

    /**
     * Attempts to parse a form from a Request or Response. Returns the parsed object in case of success and 
     * an error object in case of failure.
     * @param {Request | Response} input - Request or Response to parse the form from.
     * @param {BodyguardAcceptedValidator} validator - Optional validator to validate the parsed form against.
     * @param {Partial<BodyguardFormConfig>} config - Optional configuration to override the default configuration.
     * @return {Promise<BodyguardResult<BodyguardValidatorOutput<T>, E>>} - Result of the parsing operation.
     */
    async softForm<T extends BodyguardAcceptedValidator | undefined = undefined, E = GenericError>(
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardFormConfig>
    ): Promise<BodyguardResult<BodyguardValidatorOutput<T>, E>> {
        try {
            const instanceConfig = this.constructConfig(config || {});
            const parsed = await this.formInternal(input, config);
            let ret = parsed;
            try {
                ret = await this.applyTransform(parsed, instanceConfig);
                if(validator) {
                    return {
                        success: true,
                        value: await this.runValidator(validator, ret)
                    };
                }
                return {
                    success: true,
                    value: ret as BodyguardValidatorOutput<T>
                };
            } catch(err: unknown) {
                return {
                    success: false,
                    error: err as E,
                    value: ret as BodyguardValidatorOutput<T>
                };
            }
        } catch(e: unknown) {
            return {
                success: false,
                error: e as E
            };
        }
    }
    
    /**
     * Parses a form from a Request or Response. Form could be urlencoded or multipart.
     * @param {Request | Response} input - Request or Response to parse the form from.
     * @param {BodyguardAcceptedValidator} validator - Optional validator to validate the parsed form against.
     * @param {Partial<BodyguardFormConfig>} config - Optional configuration to override the default configuration.
     * @return {Promise<BodyguardValidatorOutput<T>>} - Parsed form from the Request or Response.
     * @throws {Error} - If content-type is not present or is invalid, or the form data is invalid, it throws an error.
     */
    async form<T extends BodyguardAcceptedValidator | undefined = undefined>(
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardFormConfig>
    ): Promise<BodyguardValidatorOutput<T>> {
        const instanceConfig = this.constructConfig(config || {});
        const parsed = await this.formInternal(input, config);
        const ret = await this.applyTransform(parsed, instanceConfig);
        if(validator) {
            return await this.runValidator(validator, ret);
        }
        return ret as BodyguardValidatorOutput<T>;
    }

    private async jsonInternal<
        K extends JSONLike = JSONLike
    > (
        input: Request | Response,
        config?: Partial<BodyguardConfig>
    ): Promise<K> {
        if(!input.body) throw new Error(ERRORS.BODY_NOT_AVAILABLE);
        const instanceConfig = this.constructConfig(config || {});
        const parser = new JSONParser(instanceConfig);
        const ret = await parser.parse(input.body);
        return ret as K;
    }

    /**
     * Attempts to parse JSON from a Request or Response. Returns the parsed JSON in case of success and 
     * an error object in case of failure.
     * @param {Request | Response} input - Request or Response to parse the JSON from.
     * @param {BodyguardAcceptedValidator} validator - Optional validator to validate the parsed JSON against.
     * @param {BodyguardConfig} config - Optional configuration to override the default configuration.
     * @return {Promise<BodyguardResult<BodyguardValidatorOutput<T>, E>>} - Result of the parsing operation.
     */
    async softJson<T extends BodyguardAcceptedValidator | undefined = undefined, E = GenericError>(
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig>
    ): Promise<BodyguardResult<BodyguardValidatorOutput<T>, E>> {
        try {
            const instanceConfig = this.constructConfig(config || {});
            const parsed = await this.jsonInternal(input, config);
            let ret = parsed;
            try {
                ret = await this.applyTransform(parsed, instanceConfig);
                if(validator) {
                    return {
                        success: true,
                        value: await this.runValidator(validator, ret)
                    };
                }
                return {
                    success: true,
                    value: ret as BodyguardValidatorOutput<T>
                };
            } catch(err: unknown) {
                return {
                    success: false,
                    error: err as E,
                    value: ret as BodyguardValidatorOutput<T>
                };
            }
        } catch(e: unknown) {
            return {
                success: false,
                error: e as E
            };
        }
    }

    /**
     * Parses JSON from a Request or Response.
     * @param {Request | Response} input - Request or Response to parse the JSON from.
     * @param {BodyguardAcceptedValidator} validator - Optional validator to validate the parsed JSON against.
     * @param {BodyguardConfig} config - Optional configuration to override the default configuration.
     * @return {Promise<BodyguardValidatorOutput<T>>} - Parsed JSON from the Request or Response.
     * @throws {Error} - If JSON parsing fails, it throws an error.
     */
    async json<T extends BodyguardAcceptedValidator | undefined = undefined>(
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig>
    ): Promise<BodyguardValidatorOutput<T>> {
        const instanceConfig = this.constructConfig(config || {});
        const parsed = await this.jsonInternal(input, config);
        const ret = await this.applyTransform(parsed, instanceConfig);
        if(validator) {
            return await this.runValidator(validator, ret);
        }
        return ret as BodyguardValidatorOutput<T>;
    }

    private async textInternal<
        K extends JSONLike = JSONLike
    > (
        input: Request | Response,
        config?: Partial<BodyguardConfig>
    ): Promise<K> {
        if(!input.body) throw new Error(ERRORS.BODY_NOT_AVAILABLE);
        const instanceConfig = this.constructConfig(config || {});
        const parser = new TextParser(instanceConfig);
        const ret = await parser.parse(input.body);
        return ret as K;
    }

    /**
     * Attempts to parse text from a Request or Response. Returns the parsed text in case of success and
     * an error object in case of failure.
     * @param {Request | Response} input - Request or Response to parse the text from.
     * @param {BodyguardAcceptedValidator} validator - Optional validator to validate the parsed text against.
     * @param {BodyguardConfig} config - Optional configuration to override the default configuration.
     * @returns {Promise<BodyguardResult<BodyguardValidatorOutput<T, string>, E>>} - Result of the parsing operation.
     */
    async softText<T extends BodyguardAcceptedValidator | undefined = undefined, E = GenericError>(
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig>
    ): Promise<BodyguardResult<BodyguardValidatorOutput<T, string>, E>> {
        try {
            const ret = await this.textInternal(input, config);
            try {
                if(validator) {
                    return {
                        success: true,
                        value: await this.runValidator(validator, ret) as BodyguardValidatorOutput<T, string>
                    };
                }
                return {
                    success: true,
                    value: ret as BodyguardValidatorOutput<T, string>
                };
            } catch(err: unknown) {
                return {
                    success: false,
                    error: err as E,
                    value: ret as BodyguardValidatorOutput<T, string>
                };
            }
        } catch(e: unknown) {
            return {
                success: false,
                error: e as E
            };
        }
    }

    /**
     * Parses text from a Request or Response.
     * @param {Request | Response} input - Request or Response to parse the text from.
     * @param {BodyguardAcceptedValidator} validator - Optional validator to validate the parsed text against.
     * @param {BodyguardConfig} config - Optional configuration to override the default configuration.
     * @returns {Promise<BodyguardValidatorOutput<T, string>>} - Parsed text from the Request or Response.
     * @throws {Error} - If text parsing fails, it throws an error.
     */
    async text<T extends BodyguardAcceptedValidator | undefined = undefined>(
        input: Request | Response,
        validator?: T,
        config?: Partial<BodyguardConfig>
    ): Promise<BodyguardValidatorOutput<T, string>> {
        const ret = await this.textInternal(input, config);
        if(validator) {
            return await this.runValidator(validator, ret) as BodyguardValidatorOutput<T, string>;
        }
        return ret as BodyguardValidatorOutput<T, string>;
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
            transform: typeof config?.transform === 'function' ? config.transform : this.config.transform,
        };
    }

}
