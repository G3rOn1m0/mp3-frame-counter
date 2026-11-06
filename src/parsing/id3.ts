import type { Buffer } from 'node:buffer'
import { MpegParseError } from './errors.js'

export type ID3v2Tag = {
	version: string
	flags: number
	tagSize: number
	tagEnd: number
}

const parseID3v2Header = (buffer: Buffer): ID3v2Tag => {
	if (buffer.length < 10) {
		throw new MpegParseError('INVALID_ID3V2_TAG', 'ID3v2 header is incomplete')
	}

	const version = buffer.readUInt8(3)
	const revision = buffer.readUInt8(4)
	const flags = buffer.readUInt8(5)

	if (version < 2 || version > 4 || revision === 0xff) {
		throw new MpegParseError(
			'INVALID_ID3V2_TAG',
			`Unsupported or invalid ID3v2 version ${version}.${revision}`,
		)
	}

	const reservedFlagsMask = version === 2 ? 0x3f : version === 3 ? 0x1f : 0x0f
	if ((flags & reservedFlagsMask) !== 0) {
		throw new MpegParseError(
			'INVALID_ID3V2_TAG',
			'ID3v2 header contains reserved flag bits',
		)
	}

	const sizeBytes: [number, number, number, number] = [
		buffer.readUInt8(6),
		buffer.readUInt8(7),
		buffer.readUInt8(8),
		buffer.readUInt8(9),
	]
	if (sizeBytes.some((byte) => byte > 0x7f)) {
		throw new MpegParseError(
			'INVALID_ID3V2_TAG',
			'ID3v2 tag size is not synchsafe',
		)
	}

	const tagSize =
		sizeBytes[0] * 0x200000 +
		sizeBytes[1] * 0x4000 +
		sizeBytes[2] * 0x80 +
		sizeBytes[3]

	return {
		version: `2.${version}.${revision}`,
		flags,
		tagSize,
		tagEnd: 10 + tagSize,
	}
}

export function parseID3v2(buffer: Buffer): ID3v2Tag | null {
	if (buffer.subarray(0, 3).toString('ascii') !== 'ID3') {
		return null
	}

	const tag = parseID3v2Header(buffer)
	if (tag.tagEnd > buffer.length) {
		throw new MpegParseError(
			'INVALID_ID3V2_TAG',
			'ID3v2 tag declares a size beyond the end of the file',
		)
	}

	return tag
}

export function getAudioEnd(buffer: Buffer): number {
	const id3v1Start = buffer.length - 128
	if (
		id3v1Start >= 0 &&
		buffer.subarray(id3v1Start, id3v1Start + 3).toString('ascii') === 'TAG'
	) {
		return id3v1Start
	}

	return buffer.length
}

export { parseID3v2Header }
