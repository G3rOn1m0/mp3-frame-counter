import { Buffer } from 'node:buffer'

export function makeFrames(
	secondHeaderByte: number,
	frameLength = 417,
	frameCount = 2,
	bitrateSampleByte = 0x90,
): Buffer {
	const frames: Buffer[] = []

	for (let index = 0; index < frameCount; index += 1) {
		const frame = Buffer.alloc(frameLength)
		Buffer.from([0xff, secondHeaderByte, bitrateSampleByte, 0x64]).copy(frame)
		frames.push(frame)
	}

	return Buffer.concat(frames)
}

export function makeId3v2Prefix(body: Buffer): Buffer {
	const size = body.length
	const header = Buffer.from([
		0x49,
		0x44,
		0x33,
		0x04,
		0x00,
		0x00,
		(size >> 21) & 0x7f,
		(size >> 14) & 0x7f,
		(size >> 7) & 0x7f,
		size & 0x7f,
	])

	return Buffer.concat([header, body])
}

export function makeXingInfoFrames(audioFrameCount: number): Buffer {
	const frameLength = 417
	const frames = makeFrames(0xfb, frameLength, audioFrameCount + 1)
	const xingOffset = 36

	Buffer.from('Xing').copy(frames, xingOffset)
	frames.writeUInt32BE(0x0f, xingOffset + 4)
	frames.writeUInt32BE(audioFrameCount, xingOffset + 8)
	frames.writeUInt32BE(frames.length, xingOffset + 12)

	for (let index = 0; index < 100; index += 1) {
		frames[xingOffset + 16 + index] = Math.round((index * 255) / 99)
	}

	frames.writeUInt32BE(0, xingOffset + 116)
	Buffer.from('LAME3.100').copy(frames, xingOffset + 120)
	return frames
}

export function makeVbriFrames(audioFrameCount: number): Buffer {
	const frames = makeFrames(0xfb, 417, audioFrameCount + 1)
	const vbriOffset = 36

	Buffer.from('VBRI').copy(frames, vbriOffset)
	frames.writeUInt16BE(1, vbriOffset + 4)
	frames.writeUInt32BE(frames.length, vbriOffset + 10)
	frames.writeUInt32BE(audioFrameCount, vbriOffset + 14)
	return frames
}

export async function* splitIntoChunks(
	buffer: Buffer,
	chunkSize: number,
): AsyncGenerator<Buffer, void, unknown> {
	for (let offset = 0; offset < buffer.length; offset += chunkSize) {
		yield buffer.subarray(offset, offset + chunkSize)
	}
}
