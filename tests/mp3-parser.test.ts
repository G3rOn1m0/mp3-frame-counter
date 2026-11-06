import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { test } from 'node:test'
import {
	countMpegLayer3Frames,
	countMpegLayer3FramesFromStream,
	isMpegLayer3,
	MpegParseError,
} from '../src/parsing/mp3Parser.js'
import {
	makeFrames,
	makeId3v2Prefix,
	makeXingInfoFrames,
	splitIntoChunks,
} from './helpers/mp3Fixtures.js'

test('accepts consecutive MPEG Layer III frames', () => {
	assert.equal(isMpegLayer3(makeFrames(0xfb)), true)
})

test('counts consecutive MPEG Layer III frames', () => {
	assert.equal(countMpegLayer3Frames(makeFrames(0xfb)), 2)
})

test('counts each frame across variable bitrates', async () => {
	const highBitrateFrames = makeFrames(0xfb, 417, 2, 0x90)
	const lowBitrateFrames = makeFrames(0xfb, 365, 2, 0x80)
	const frames = Buffer.concat([highBitrateFrames, lowBitrateFrames])

	assert.equal(countMpegLayer3Frames(frames), 4)
	assert.equal(
		await countMpegLayer3FramesFromStream(splitIntoChunks(frames, 73)),
		4,
	)
})

test('counts frames when stream chunks split frame headers and payloads', async () => {
	assert.equal(
		await countMpegLayer3FramesFromStream(splitIntoChunks(makeFrames(0xfb), 7)),
		2,
	)
})

test('does not count a leading Xing metadata frame as audio', () => {
	const frames = makeXingInfoFrames(2)

	assert.equal(countMpegLayer3Frames(frames), 2)
})

test('does not count a leading Xing metadata frame from a stream', async () => {
	const frames = makeXingInfoFrames(2)

	assert.equal(
		await countMpegLayer3FramesFromStream(splitIntoChunks(frames, 29)),
		2,
	)
})

test('counts frames before a trailing ID3v1 tag', () => {
	const id3v1Tag = Buffer.alloc(128)
	Buffer.from('TAG').copy(id3v1Tag)
	assert.equal(
		countMpegLayer3Frames(Buffer.concat([makeFrames(0xfb), id3v1Tag])),
		2,
	)
})

test('counts streamed frames before a trailing ID3v1 tag', async () => {
	const id3v1Tag = Buffer.alloc(128)
	Buffer.from('TAG').copy(id3v1Tag)
	const input = Buffer.concat([makeFrames(0xfb), id3v1Tag])
	assert.equal(
		await countMpegLayer3FramesFromStream(splitIntoChunks(input, 19)),
		2,
	)
})

test('accepts Layer III frames after a valid ID3v2 tag', () => {
	const tag = makeId3v2Prefix(Buffer.from([0x01, 0x02, 0x03, 0x04]))
	assert.equal(isMpegLayer3(Buffer.concat([tag, makeFrames(0xfb)])), true)
})

test('counts streamed frames after a valid ID3v2 tag', async () => {
	const tag = makeId3v2Prefix(Buffer.from([0x01, 0x02, 0x03, 0x04]))
	const input = Buffer.concat([tag, makeFrames(0xfb)])
	assert.equal(
		await countMpegLayer3FramesFromStream(splitIntoChunks(input, 3)),
		2,
	)
})

test('rejects MPEG-2 Layer III frames', () => {
	assert.equal(isMpegLayer3(makeFrames(0xf3, 261)), false)
})

test('rejects MPEG audio using a layer other than Layer III', () => {
	assert.equal(isMpegLayer3(makeFrames(0xfd)), false)
})

test('rejects data without MPEG audio frames', () => {
	assert.equal(isMpegLayer3(Buffer.from('not an MP3 file')), false)
})

test('rejects an ID3v2 tag larger than the buffer', () => {
	const invalidTag = Buffer.from([
		0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x7f, 0x7f, 0x7f, 0x7f,
	])
	const buffer = Buffer.concat([invalidTag, makeFrames(0xfb)])
	assert.equal(isMpegLayer3(buffer), false)
	assert.throws(
		() => countMpegLayer3Frames(buffer),
		(error: unknown) =>
			error instanceof MpegParseError &&
			error.code === 'INVALID_ID3V2_TAG' &&
			error.message.includes('beyond the end of the file'),
	)
})

test('rejects a truncated frame instead of returning a partial count', () => {
	assert.throws(
		() => countMpegLayer3Frames(makeFrames(0xfb).subarray(0, 500)),
		(error: unknown) =>
			error instanceof MpegParseError &&
			error.code === 'TRUNCATED_FRAME' &&
			error.offset === 417,
	)
})

test('rejects invalid data after valid frames instead of returning a partial count', () => {
	const invalidTrailingData = Buffer.concat([
		makeFrames(0xfb),
		Buffer.from([0x00, 0x01, 0x02, 0x03]),
	])
	assert.throws(
		() => countMpegLayer3Frames(invalidTrailingData),
		(error: unknown) =>
			error instanceof MpegParseError &&
			error.code === 'INVALID_FRAME' &&
			error.offset === 834,
	)
})
