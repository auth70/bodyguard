# Changelog

## 1.5.0 (2024-02-20)

### New Features

- **File upload support in multipart forms.** `form()` and `softForm()` will return uploaded files as [File objects](https://developer.mozilla.org/en-US/docs/Web/API/File).

## 1.4.0 (2024-02-19)

### Breaking Changes

- The `error` returned from `soft*` methods is now the error thrown by the handler without coercing it into a string. If you need further type narrowing, you can use the `as` operator in your catch block. Bodyguard errors are regular `Error` instances with the message as one of the consts from `ERRORS`.

### New Features

- You can pass `convertPluses` as an option to the form methods to convert `+` to spaces in the form data when it's submitted in URL-encoded format. It won't affect multipart form data.

### Updates

- Updated dependencies.
