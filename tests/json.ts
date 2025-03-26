import { describe, it, expect } from 'vitest';
import { Bodyguard } from '../src/index.js';
import { ERRORS, JSONLike, BodyguardValidator } from '../src/lib.js';

describe('JSON tests', () => {
    it('throws on prototype pollution (softJson)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: "{\"__proto__\": \"a\"}"
        });

        const validator: BodyguardValidator = (data: unknown): JSONLike => data as JSONLike;
        const result = await bodyguard.softJson(req, validator);

        expect(result.success).toBe(false);

        if(!result.success) {
            expect(result.error.message).toBe(ERRORS.INVALID_INPUT);
        }
    });

    it('fails with no body (softJson)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
        });

        const result = await bodyguard.softJson(req);

        expect(result.success).toBe(false);

        if(!result.success) {
            expect(result.error.message).toBe(ERRORS.BODY_NOT_AVAILABLE);
        }
    });

    it('passes json with validator (softJson)', async () => {
        const bodyguard = new Bodyguard();

        type TestObj = {
            a: number;
            b: number;
        };
        
        const obj: TestObj = {
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

        const validator = (data: unknown): TestObj => {
            const typedData = data as any;
            if(typeof typedData.a !== 'number') throw new Error('a is not a number');
            if(typeof typedData.b !== 'number') throw new Error('b is not a number');
            return typedData as TestObj;
        };
        
        const result = await bodyguard.softJson(req, validator);

        expect(result.success).toBe(true);

        if(result.success) {
            const value = result.value as TestObj;
            expect(value.a).toBe(obj.a);
            expect(value.b).toBe(obj.b);
        }
    });

    it('fails json with validator (softJson)', async () => {
        const bodyguard = new Bodyguard();

        const obj = {
            a: 1,
            b: "2"
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
            if(typeof typedData.a !== 'number') throw new Error('a is not a number');
            if(typeof typedData.b !== 'number') throw new Error('b is not a number');
            return typedData as { a: number, b: number };
        };
        
        const result = await bodyguard.softJson(req, validator);

        expect(result.success).toBe(false);
    });

    it('passes nested json with arrays (softJson)', async () => {
        const bodyguard = new Bodyguard();

        type ComplexObj = {
            rootA: number;
            rootB: {
                depth1A: {
                    depth2A: {
                        B: number[];
                        C: string;
                    }
                }
            }
        };

        const obj: ComplexObj = {
            rootA: 1,
            rootB: {
                depth1A: {
                    depth2A: {
                        B: [1, 2, 3],
                        C: 'foo'
                    }
                }
            }
        };

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify(obj)
        });

        const validator = (data: unknown): ComplexObj => data as ComplexObj;
        const result = await bodyguard.softJson(req, validator);

        expect(result.success).toBe(true);

        if(result.success) {
            const value = result.value as ComplexObj;
            expect(value.rootA).toBe(obj.rootA);
            expect(value.rootB.depth1A.depth2A.B[0]).toBe(obj.rootB.depth1A.depth2A.B[0]);
            expect(value.rootB.depth1A.depth2A.B[1]).toBe(obj.rootB.depth1A.depth2A.B[1]);
            expect(value.rootB.depth1A.depth2A.B[2]).toBe(obj.rootB.depth1A.depth2A.B[2]);
            expect(value.rootB.depth1A.depth2A.C).toBe(obj.rootB.depth1A.depth2A.C);
        }
    });

    it('fails on too many input bytes (softJson)', async () => {
        const bodyguard = new Bodyguard({
            maxSize: 10,
        });

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: '{"foo": "bar"}'
        });

        const result = await bodyguard.softJson(req);
        
        expect(result.success).toBe(false);

        if(!result.success) {
            expect(result.error.message).toBe(ERRORS.MAX_SIZE_EXCEEDED);
        }
    });

    it('fails on invalid json (softJson)', async () => {
        const bodyguard = new Bodyguard();

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: '{foo: "bar"}'
        });

        const result = await bodyguard.softJson(req);
        
        expect(result.success).toBe(false);

        if(!result.success) {
            expect(result.error.message).toBe(ERRORS.INVALID_INPUT);
        }
    });

    it('fails on too long key (softJson)', async () => {
        const bodyguard = new Bodyguard({
            maxKeyLength: 2,
        });

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: '{"foo": "bar"}'
        });

        const result = await bodyguard.softJson(req);
        
        expect(result.success).toBe(false);

        if(!result.success) {
            expect(result.error.message).toBe(ERRORS.KEY_TOO_LONG);
        }
    });

    it('fails on too many input keys (softJson)', async () => {
        const bodyguard = new Bodyguard({
            maxKeys: 3,
        });

        const obj = {
            rootA: 1,
            rootB: {
                depth1A: "{\"nested\": {\"foo\":\"bar\"}\"}",
                depth1B: {
                    depth2A: {
                        depth3A: {
                            depth4A: {
                                depth5A: {
                                    'foo': 'bar'
                                }
                            }
                        }
                    }
                }
            },
            e: [1, 2, 3]
        };
        
        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify(obj)
        });

        const validator: BodyguardValidator = (data: unknown): JSONLike => data as JSONLike;
        const result = await bodyguard.softJson(req, validator);

        expect(result.success).toBe(false);

        if(!result.success) {
            expect(result.error.message).toBe(ERRORS.TOO_MANY_KEYS);
        }
    });

    it('fails on too deep input (JSON)', async () => {
        const bodyguard = new Bodyguard({
            maxDepth: 1,
        });

        const req = new Request("http://localhost", {
            method: "POST",
            headers: {
                "content-type": "application/json"
            },
            body: JSON.stringify({
                a: {
                    b: 1
                }
            })
        });

        const validator: BodyguardValidator = (data: unknown): JSONLike => data as JSONLike;
        const result = await bodyguard.softJson(req, validator);

        expect(result.success).toBe(false);

        if(!result.success) {
            expect(result.error.message).toBe(ERRORS.TOO_DEEP);
        }
    });
});