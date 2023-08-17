# @auth70/bodyguard

## Description

Opinionated [ReadableStream](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) body parser and guard for Fetch API objects with no Node.js specific dependencies, specifically intended for RESTful and form parsing.

### Features

- Simple ESM-only API that's hard to mess up, written in TypeScript.
- Supports only the most common content types for JSON and form parsing.
- Automatically parses JSON and form data streams into JavaScript objects.
- Prevents resource exhaustion by bailing early on streams that are too large, have too many (or too large) keys, or have too much nesting.
- Allows nested object and array form data with dot and square bracket syntax in both multipart and URL-encoded forms.
- Allows nested (multi-boundary) multipart form data.
- Optionally enforce parsed data to pass a user-chosen schema validator (e.g. Zod)

### TODO

- File uploads in multipart form data.

## Installation

```bash
npm install --save @auth70/bodyguard
```

## Usage

Initialise a Bodyguard instance with your preferred options and use it as a singleton or attach it to your requests. 

```ts
// All options are optional
const bodyguard = new Bodyguard({
    maxSize: 1024 * 1024 * 1, // Default: 1MB
    maxKeys: 100, // Default: Allows up to 100 total keys
    maxDepth: 10, // Default: Allows up to 10 levels of nesting
    maxKeyLength: 100, // Default: Allows up to 100 characters per key
    validator: (obj, schema) => {
        return {
            success: true,
            value: obj,
        }
    }, // Default: No validator
});
```

Then in a route, use:

- `json()`/`form()` (throws an error), or
- `softJson()`/`softForm()` (returns an error)

to parse the request body into a JavaScript object.

```ts
const { success, value } = await bodyguard.softForm(request, schema);
```


### Supported content types

#### application/json

`JSON.parse()` compatible parsing using [@streamparser/json](https://github.com/juanjoDiaz/streamparser-json).

#### multipart/form-data

Using [@exact-realty/multipart-parser](https://github.com/Exact-Realty/ts-multipart-parser).

Form data is automatically mapped into a JavaScript object, with support for:

- Strings
- Numbers
- Nested objects using dot notation syntax
- Nested arrays using square bracket syntax, with support for both numeric and auto-incrementing indexes

See [Parsing rules](#parsing-rules) for more information.

#### application/x-www-form-urlencoded

URL-encoded form data is automatically mapped into a JavaScript object, with support for:

- Strings, numbers, and booleans
- Nested objects and arrays using dot and square bracket syntax respectively

## Examples

### SvelteKit example

<details>
<summary><strong>Expand example</strong></summary>

**src/global.d.ts**

```ts
/// <reference types="@sveltejs/kit" />

import type { Bodyguard } from '@auth70/bodyguard';

declare global {
    namespace App {
        interface Locals {
            bodyguard: Bodyguard
        }
    }
}

export {};
```

**src/hooks.server.ts**

```ts
import { Bodyguard } from '@auth70/bodyguard';
import type { Handle } from '@sveltejs/kit'

const bodyguard = new Bodyguard({
  maxSize: 1024 * 1024 * 1, // 1MB
  maxKeys: 100,
  maxDepth: 10,
});

export const handle = (async ({ event, resolve }) => {
    event.locals.bodyguard = bodyguard;
    return resolve(event);
}) satisfies Handle;
```

**routes/+page.server.ts**

```ts
import { z } from 'zod';

const RouteSchema = z.object({ name: z.string() });

export const actions = {
    default: async ({ request, locals }) => {
        const { success, value } = await locals.bodyguard.form(request, RouteSchema);
        /**
         * success: boolean
         * value: { id: number; name: string }
         */
        return {
            status: 302,
            headers: {
                location: `/${value.name}`,
            },
        }
    },
} satisfies Actions;
```
</details>

### Hono example

<details id="hono-example">
<summary><strong>Expand example</strong></summary>
TODO (PR welcome)
</details>

### Next.js example

<details id="hono-example">
<summary><strong>Expand example</strong></summary>
TODO (PR welcome)
</details>

## Parsing rules

### JSON

JSON data is returned like `JSON.parse()` would return it.

### Form data

- Trailing newline is stripped from the end of the value for multipart form data.
- URL encoded values are decoded using `decodeURIComponent()`.

#### Numbers

If the value passes `!isNaN()` it's cast as a number. i.e. `"3"` is returned as `3`, `"3.14"` is returned as `3.14`, etc.

#### Booleans

*Booleans are not cast automatically by default.* If the value is `"true"` or `"false"`, it's **not** cast as a boolean but returned as a string unless you specify `castBooleans` as `true` in parser configuration. This is to prevent accidental casting of values that are not intended to be booleans.

#### Empty strings

Empty strings are returned as `""`.

#### Array indices with gaps

Array indices with gaps are returned as sparse arrays. i.e. `foo[1] = "3"` is returned as `foo: [undefined, 3]`.

#### Object and array form data

To parse objects from form data, use dot notation in the input name accessor. For arrays, use square brackets.

```html
<form>
    <input type="text" name="a_string" value="bar" />
    <input type="text" name="a_number" value="3" />
    <!-- array accessors -->
    <input type="text" name="an_array[]" value="foo" /> <!-- auto-incrementing index -->
    <input type="text" name="an_array[1]" value="bar" /> <!-- numeric index -->
    <!-- object accessors -->
    <input type="text" name="an_object.fox" value="fox" />
    <!-- nested object accessor -->
    <input type="text" name="an_object.dog.bark" value="bark" />
    <!-- nested object and array accessor -->
    <input type="text" name="an_object.cat[].meow" value="meow?" />
    <input type="text" name="an_object.cat[2].meow" value="meow!" /> <!-- leaves index 1 undefined -->
</form>
```

Comes out as:

```ts
{
    a_string: 'bar',
    a_number: 3,
    an_array: ['foo', 'bar'],
    an_object: {
        fox: 'fox',
        dog: {
            bark: 'bark',
        },
        cat: [
            { meow: 'meow?' },
            undefined,
            { meow: 'meow!' },
        ],
    },
}
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

MIT