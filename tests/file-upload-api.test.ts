import assert from 'node:assert/strict'
import { once } from 'node:events'
import type { Server } from 'node:http'
import { after, before, test } from 'node:test'
import { createApp } from '../src/app.js'
import { makeFrames } from './helpers/mp3Fixtures.js'

type ApiResponse = {
	code?: string
	message?: string
	offset?: number | null
	frameCount?: number
}

const uploadLimitBytes = 900
let server: Server
let endpoint: string

before(async () => {
	server = createApp({ uploadLimitBytes }).listen(0, '127.0.0.1')
	await once(server, 'listening')

	const address = server.address()
	if (!address || typeof address === 'string') {
		throw new Error('Test server did not bind to a TCP port.')
	}
	endpoint = `http://127.0.0.1:${address.port}/api/file_upload`
})

after(async () => {
	await new Promise<void>((resolve, reject) => {
		server.close((error) => (error ? reject(error) : resolve()))
	})
})

async function uploadFile(
	contents?: Buffer,
	fieldName = 'file',
): Promise<Response> {
	const form = new FormData()
	if (contents) {
		form.append(fieldName, new Blob([Uint8Array.from(contents)]), 'upload.mp3')
	}
	return fetch(endpoint, { method: 'POST', body: form })
}

async function readJson(response: Response): Promise<ApiResponse> {
	return (await response.json()) as ApiResponse
}

test('returns the exact frame count for an uploaded MP3', async () => {
	const response = await uploadFile(makeFrames(0xfb))

	assert.equal(response.status, 200)
	assert.deepEqual(await readJson(response), { frameCount: 2 })
})

test('returns a clear 400 response when no file is uploaded', async () => {
	const response = await uploadFile()

	assert.equal(response.status, 400)
	assert.deepEqual(await readJson(response), {
		code: 'NO_FILE',
		message: 'No file uploaded.',
	})
})

test('rejects uploads that use an unexpected multipart field', async () => {
	const response = await uploadFile(makeFrames(0xfb), 'audio')
	const body = await readJson(response)

	assert.equal(response.status, 400)
	assert.equal(body.code, 'INVALID_UPLOAD')
})

test('maps uploads over the configured size limit to 413', async () => {
	const response = await uploadFile(Buffer.alloc(uploadLimitBytes + 1))
	const body = await readJson(response)

	assert.equal(response.status, 413)
	assert.equal(body.code, 'FILE_TOO_LARGE')
})

const parserErrorCases: Array<{
	name: string
	file: Buffer
	status: number
	code: string
	offset: number | null
}> = [
	{
		name: 'incomplete ID3v2 tag',
		file: Buffer.from('ID3'),
		status: 422,
		code: 'INVALID_ID3V2_TAG',
		offset: null,
	},
	{
		name: 'unsupported MPEG version',
		file: makeFrames(0xf3, 261),
		status: 415,
		code: 'UNSUPPORTED_MPEG_VERSION',
		offset: 0,
	},
	{
		name: 'unsupported MPEG layer',
		file: makeFrames(0xfd),
		status: 415,
		code: 'UNSUPPORTED_MPEG_LAYER',
		offset: 0,
	},
	{
		name: 'invalid frame header',
		file: Buffer.alloc(4),
		status: 422,
		code: 'INVALID_FRAME',
		offset: 0,
	},
	{
		name: 'truncated frame',
		file: makeFrames(0xfb).subarray(0, 500),
		status: 422,
		code: 'TRUNCATED_FRAME',
		offset: 417,
	},
	{
		name: 'no audio frames',
		file: Buffer.alloc(0),
		status: 422,
		code: 'NO_AUDIO_FRAMES',
		offset: 0,
	},
	{
		name: 'insufficient frames',
		file: makeFrames(0xfb, 417, 1),
		status: 422,
		code: 'INSUFFICIENT_FRAMES',
		offset: null,
	},
	{
		name: 'inconsistent sample rates',
		file: Buffer.concat([
			makeFrames(0xfb, 417, 1),
			makeFrames(0xfb, 384, 1, 0x94),
		]),
		status: 422,
		code: 'INCONSISTENT_SAMPLE_RATE',
		offset: 417,
	},
]

for (const parserErrorCase of parserErrorCases) {
	test(`maps ${parserErrorCase.name} to its API error response`, async () => {
		const response = await uploadFile(parserErrorCase.file)
		const body = await readJson(response)

		assert.equal(response.status, parserErrorCase.status)
		assert.equal(body.code, parserErrorCase.code)
		assert.equal(body.offset, parserErrorCase.offset)
		assert.ok(body.message)
	})
}
