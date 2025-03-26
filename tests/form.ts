import { describe, it, expect } from 'vitest';
import { Bodyguard } from '../src/index.js';
import { ERRORS, JSONLike, BodyguardValidator } from '../src/lib.js';
import { createMultipartRequest } from './util.js';

describe('Form method tests', () => {
    it('uses the form method with a validator', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h=foo+bar"
        });

        type FormData = { a: number; [key: string]: any };
        const validator = (value: unknown): FormData => {
            const typedValue = value as any;
            if (typedValue.a === 1) {
                return typedValue as FormData;
            }
            else throw new Error('invalid value');
        };

        const result = await bodyguard.form(req, validator, {
            castNumbers: true
        });

        expect(result.a).toBe(1);
    });

    it('uses the form method without a validator', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h=foo+bar"
        });

        const result = await bodyguard.form(req, undefined, {
            castNumbers: true
        });

        const typedResult = result as Record<string, any>;
        expect(typedResult).toHaveProperty('a');
        expect(typedResult.a).toBe(1);
    });

    it('throws on form validation failure', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "a=1&b=2&c.d=3&e=foo&f.g=4&f.bgfd=5&f.h=foo+bar"
        });

        const validator = (value: unknown): JSONLike => {
            throw new Error('validation failed');
        };

        await expect(bodyguard.form(req, validator)).rejects.toThrow('validation failed');
    });
});

describe('JSON method tests', () => {
    it('uses the json method with a validator', async () => {
        const bodyguard = new Bodyguard();

        const obj = {
            a: 1,
            b: 2
        };

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify(obj)
        });

        type TestObj = { a: number; b: number };
        const validator = (data: unknown): TestObj => {
            const typedData = data as any;
            if (typeof typedData.a !== 'number') throw new Error('a is not a number');
            if (typeof typedData.b !== 'number') throw new Error('b is not a number');
            return typedData as TestObj;
        };

        const result = await bodyguard.json(req, validator);

        expect(result.a).toBe(1);
        expect(result.b).toBe(2);
    });

    it('uses the json method without a validator', async () => {
        const bodyguard = new Bodyguard();

        const obj = {
            a: 1,
            b: 2
        };

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify(obj)
        });

        const result = await bodyguard.json(req);
        
        const typedResult = result as Record<string, any>;
        expect(typedResult).toHaveProperty('a');
        expect(typedResult.a).toBe(1);
    });

    it('throws on json validation failure', async () => {
        const bodyguard = new Bodyguard();

        const obj = {
            a: 1,
            b: "2"  // This will fail validation
        };

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify(obj)
        });

        const validator = (data: unknown): JSONLike => {
            const typedData = data as any;
            if (typeof typedData.b !== 'number') throw new Error('b is not a number');
            return data as JSONLike;
        };

        await expect(bodyguard.json(req, validator)).rejects.toThrow('b is not a number');
    });
});

describe('Text method tests', () => {
    it('uses the text method with a validator', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "text/plain"
            },
            body: "hello world"
        });

        const validator = (data: unknown): string => {
            const text = data as string;
            if (!text.includes('hello')) {
                throw new Error('invalid text');
            }
            return text;
        };

        const result = await bodyguard.text(req, validator);

        expect(result).toBe("hello world");
    });

    it('uses the text method without a validator', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "text/plain"
            },
            body: "hello world"
        });

        const result = await bodyguard.text(req);

        expect(result).toBe("hello world");
    });

    it('throws on text validation failure', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "text/plain"
            },
            body: "hello world"
        });

        const validator = (data: unknown): string => {
            throw new Error('validation failed');
        };

        await expect(bodyguard.text(req, validator)).rejects.toThrow('validation failed');
    });
});

describe('Configuration tests', () => {
    it('handles custom configurations', async () => {
        // Test configuration with various options to exercise the constructConfig method
        const bodyguard = new Bodyguard({
            maxKeys: 10,
            maxDepth: 5, 
            maxSize: 1000,
            maxKeyLength: 50,
            castBooleans: true,
            castNumbers: true,
            maxFiles: 5,
            maxFilenameLength: 100,
            allowedContentTypes: ['image/jpeg', 'image/png']
        });

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify({ 
                bool: "true", 
                num: "42" 
            })
        });

        const result = await bodyguard.json(req);
        const typedResult = result as Record<string, any>;
        expect(typedResult).toHaveProperty('bool');
        expect(typedResult).toHaveProperty('num');
    });

    it('overrides configuration per-request', async () => {
        const bodyguard = new Bodyguard({
            castBooleans: false,
            castNumbers: false
        });

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/x-www-form-urlencoded"
            },
            body: "bool=true&num=42"
        });

        // Override the configuration for this specific request
        const result = await bodyguard.form(req, undefined, {
            castBooleans: true,
            castNumbers: true
        });

        const typedResult = result as Record<string, any>;
        expect(typedResult.bool).toBe(true);
        expect(typedResult.num).toBe(42);
    });
}); 