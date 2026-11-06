# MP3 Frame Counter API

A small Express API that accepts an MP3 upload and returns the number of supported MPEG-1 Layer III audio frames it contains.

## Requirements

- Node.js and npm

## Install

```sh
npm install
```

## Run

For development, start the server with automatic restarts:

```sh
npm run dev
```

The API listens on `http://localhost:3000`.

For a production build:

```sh
npm run build
npm start
```

## Upload an MP3

Send a `multipart/form-data` request to `POST /file-upload`. The uploaded file must use the field name `file`.

```sh
curl -i \
  -F 'file=@./path/to/your file.mp3' \
  http://localhost:3000/file-upload
```

The `@` tells curl to attach the file's contents. Without it, curl sends the path as ordinary text. The quotes keep paths containing spaces together.

A successful request returns JSON similar to:

```json
{
	"frameCount": 6089
}
```

If no file is attached, the API returns `400 Bad Request`:

```json
{
	"code": "NO_FILE",
	"message": "No file uploaded."
}
```

Uploaded files are temporarily written to `uploads/` while they are processed, then removed.

## Supported Audio

- MPEG-1 Layer III audio is supported. Other MPEG versions or layers are rejected.
- An optional ID3v2 tag at the beginning and ID3v1 tag at the end are handled.
- A leading Xing/Info metadata frame is excluded from the audio frame count.
- The parser calculates each frame's length from its own header, so variable bitrates are supported. It requires a consistent sample rate across frames.
- The parser validates frame headers and boundaries; it does not decode or verify the audio payload itself.

Errors return JSON with a stable `code`, a `message`, and, for parser errors, the byte `offset` where the problem was found. Unsupported MPEG versions or layers return `415`, malformed or unparseable audio returns `422`, and uploads over the size limit return `413`.

## Test and Build

Run the parser test suite:

```sh
npm test
```

Compile the TypeScript source:

```sh
npm run build
```

Format the code with Biome:

```sh
npm run format
```

The tests cover parser behavior and the HTTP upload route, including error responses.
