export function generateBoundary(): string {
    let length = 10;
    let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

export function generateMultipartBody(formData: {[key: string]: any}, boundary: string): string[] {
    let bodyArray: string[] = [];

    for (let key in formData) {
        if (typeof formData[key] === 'object' && !Array.isArray(formData[key]) && formData[key] !== null) {
            // This is a nested object. We need a new boundary.
            const nestedBoundary = generateBoundary();
            bodyArray.push(`--${boundary}`);
            bodyArray.push(`Content-Disposition: form-data; name="${key}"`);
            bodyArray.push(`Content-Type: multipart/mixed; boundary=${nestedBoundary}`);
            bodyArray.push('');

            const nestedBody = generateMultipartBody(formData[key], nestedBoundary);
            bodyArray = bodyArray.concat(nestedBody);
            bodyArray.push(`--${nestedBoundary}--`);
            bodyArray.push('');
        } else if(Array.isArray(formData[key])) {
            formData[key].forEach((val: any, index: number) => {
                bodyArray.push(`--${boundary}`);
                bodyArray.push(`Content-Disposition: form-data; name="${key}[]"`);
                bodyArray.push('');
                bodyArray.push(val);
            });
        } else {
            bodyArray.push(`--${boundary}`);
            bodyArray.push(`Content-Disposition: form-data; name="${key}"`);
            bodyArray.push('');
            bodyArray.push(formData[key]);
        }
    }

    return bodyArray;
}

export function createMultipartRequest(formData: {[key: string]: any}, options?: {
    noBoundary?: boolean;
    brokenBoundary?: boolean;
    prototypePollution?: boolean;
}): [Request, string] {
    const boundary = generateBoundary();
    let bodyArray: string[] = generateMultipartBody(formData, boundary);

    if(options?.prototypePollution) {
        bodyArray.push('');
        bodyArray.push(`--${boundary}`);
        bodyArray.push(`Content-Disposition: form-data; name="__proto__"`);
        bodyArray.push('');
        bodyArray.push('a');
    }

    bodyArray.push(`--${boundary}--`);
    bodyArray.push('');

    let bodyStr = bodyArray.join('\r\n');

    const stream = new ReadableStream({
        start(controller) {
            controller.enqueue(new TextEncoder().encode(bodyStr));
            controller.close();
        }
    })

    let hdr = `multipart/form-data; boundary=${boundary}`;

    if(options?.noBoundary) {
        hdr = "multipart/form-data";
    }

    if(options?.brokenBoundary) {
        hdr = `multipart/form-data; boundary=`;
    }

    return [new Request("http://localhost", ({
        method: "POST",
        headers: {
            "content-type": hdr,
            "content-length": bodyStr.length.toString()
        },
        body: stream,
        duplex: "half"
    } as any)), boundary];
}

/**
 * A urlencoded request as a browser posts it. URLSearchParams is the serializer a native form post
 * uses, so brackets arrive percent-encoded and spaces arrive as pluses.
 */
export function createUrlencodedRequest(pairs: [name: string, value: string][]): Request {
    return new Request("http://localhost", {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams(pairs).toString()
    });
}

/** A multipart request as a browser posts it, written by the platform's own FormData serializer. */
export function createFormDataRequest(pairs: [name: string, value: string | File][]): Request {
    const formData = new FormData();
    for (const [name, value] of pairs) formData.append(name, value);
    return new Request("http://localhost", { method: "POST", body: formData });
}

/** A request whose body arrives in chunks of `size` bytes. */
export function createChunkedRequest(bytes: Uint8Array, contentType: string, size: number): Request {
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
            controller.close();
        }
    });

    return new Request("http://localhost", ({
        method: "POST",
        headers: {
            "content-type": contentType
        },
        body: stream,
        duplex: "half"
    } as any));
}
