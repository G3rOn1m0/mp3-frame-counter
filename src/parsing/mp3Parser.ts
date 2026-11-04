import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

const mpeg1Layer3Bitrates = [
	0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
]
const baseSampleRates = [44100, 48000, 32000]

type MpegParseErrorCode =
	| 'INVALID_INPUT'
	| 'INVALID_ID3V2_TAG'
	| 'UNSUPPORTED_MPEG_VERSION'
	| 'UNSUPPORTED_MPEG_LAYER'
	| 'INVALID_FRAME'
	| 'TRUNCATED_FRAME'
	| 'NO_AUDIO_FRAMES'
	| 'INSUFFICIENT_FRAMES'
	| 'INCONSISTENT_SAMPLE_RATE'

export class MpegParseError extends Error {
	readonly code: MpegParseErrorCode
	readonly offset: number | null

	constructor(code: MpegParseErrorCode, message: string, offset?: number) {
		super(offset === undefined ? message : `${message} at byte ${offset}`)
		this.name = 'MpegParseError'
		this.code = code
		this.offset = offset ?? null
	}
}

type ID3v2Tag = {
	version: string
	flags: number
	tagSize: number
	tagEnd: number
}

const parseID3v2 = (buffer: Buffer): ID3v2Tag | null => {
	if (buffer.subarray(0, 3).toString('ascii') !== 'ID3') {
		return null
	}

	if (buffer.length < 10) {
		throw new MpegParseError('INVALID_ID3V2_TAG', 'ID3v2 header is incomplete')
	}

	const version = buffer[3]!
	const revision = buffer[4]!
	const flags = buffer[5]!

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
	const tagEnd = 10 + tagSize
	if (tagEnd > buffer.length) {
		throw new MpegParseError(
			'INVALID_ID3V2_TAG',
			'ID3v2 tag declares a size beyond the end of the file',
		)
	}

	return {
		version: `2.${version}.${revision}`,
		flags,
		tagSize,
		tagEnd,
	}
}

const getAudioEnd = (buffer: Buffer) => {
	const id3v1Start = buffer.length - 128
	if (
		id3v1Start >= 0 &&
		buffer.subarray(id3v1Start, id3v1Start + 3).toString('ascii') === 'TAG'
	) {
		return id3v1Start
	}

	return buffer.length
}

function getLayer3Frame(buffer: Buffer, offset: number, audioEnd: number) {
	if (offset === audioEnd) {
		return null
	}
	if (offset + 4 > audioEnd) {
		throw new MpegParseError(
			'TRUNCATED_FRAME',
			'Truncated MPEG frame header',
			offset,
		)
	}

	const frameHeader = buffer.readUInt32BE(offset)
	const sync = frameHeader >>> 21
	const versionBits = (frameHeader >>> 19) & 0x03
	const layerBits = (frameHeader >>> 17) & 0x03
	const bitrateIndex = (frameHeader >>> 12) & 0x0f
	const sampleRateIndex = (frameHeader >>> 10) & 0x03
	const padding = (frameHeader >>> 9) & 0x01

	if (sync !== 0x7ff) {
		throw new MpegParseError('INVALID_FRAME', 'Invalid MPEG frame sync', offset)
	}
	if (versionBits !== 0x03) {
		throw new MpegParseError(
			'UNSUPPORTED_MPEG_VERSION',
			'MPEG-1 audio is required',
			offset,
		)
	}
	if (layerBits !== 0x01) {
		throw new MpegParseError(
			'UNSUPPORTED_MPEG_LAYER',
			'Layer III audio is required',
			offset,
		)
	}
	if (bitrateIndex === 0 || bitrateIndex === 0x0f) {
		throw new MpegParseError(
			'INVALID_FRAME',
			'Invalid or unsupported MPEG bitrate index',
			offset,
		)
	}
	if (sampleRateIndex === 0x03) {
		throw new MpegParseError(
			'INVALID_FRAME',
			'Reserved MPEG sample-rate index',
			offset,
		)
	}

	const bitrate = mpeg1Layer3Bitrates[bitrateIndex]! * 1000
	const sampleRate = baseSampleRates[sampleRateIndex]!
	const frameLength = Math.floor((144 * bitrate) / sampleRate) + padding
	if (offset + frameLength > audioEnd) {
		throw new MpegParseError(
			'TRUNCATED_FRAME',
			'MPEG frame extends beyond the end of the audio data',
			offset,
		)
	}

	const hasCrc = ((frameHeader >>> 16) & 0x01) === 0
	const channelMode = (frameHeader >>> 6) & 0x03
	const sideInformationLength = channelMode === 0x03 ? 17 : 32
	const xingOffset = offset + 4 + (hasCrc ? 2 : 0) + sideInformationLength
	const xingIdentifier = buffer.toString('ascii', xingOffset, xingOffset + 4)

	return {
		sampleRate,
		frameLength,
		isXingInfoFrame: xingIdentifier === 'Xing' || xingIdentifier === 'Info',
	}
}

function parseMpegLayer3(buffer: unknown) {
	if (!Buffer.isBuffer(buffer)) {
		throw new MpegParseError('INVALID_INPUT', 'Expected an MP3 file buffer')
	}

	const id3v2Tag = parseID3v2(buffer)
	const audioStart = id3v2Tag?.tagEnd ?? 0
	const audioEnd = getAudioEnd(buffer)
	let offset = audioStart
	let frameCount = 0
	let physicalFrameCount = 0
	let streamSampleRate: number | null = null

	while (offset < audioEnd) {
		const frame = getLayer3Frame(buffer, offset, audioEnd)
		if (!frame) {
			break
		}
		if (streamSampleRate !== null && frame.sampleRate !== streamSampleRate) {
			throw new MpegParseError(
				'INCONSISTENT_SAMPLE_RATE',
				'MPEG frame sample rate changed within the stream',
				offset,
			)
		}

		streamSampleRate = frame.sampleRate
		if (physicalFrameCount > 0 || !frame.isXingInfoFrame) {
			frameCount += 1
		}
		physicalFrameCount += 1
		offset += frame.frameLength
	}

	if (frameCount === 0) {
		throw new MpegParseError(
			'NO_AUDIO_FRAMES',
			'No MPEG-1 Layer III audio frames found',
			audioStart,
		)
	}
	if (frameCount < 2) {
		throw new MpegParseError(
			'INSUFFICIENT_FRAMES',
			'Could not confirm MPEG audio: at least two consecutive frames are required',
		)
	}

	return { id3v2Tag, frameCount }
}

export function isMpegLayer3(buffer: unknown) {
	try {
		parseMpegLayer3(buffer)
		return true
	} catch {
		return false
	}
}

export function countMpegLayer3Frames(buffer: unknown) {
	return parseMpegLayer3(buffer).frameCount
}

const path = process.argv[2]
const invokedDirectly =
	process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
	if (!path) {
		console.error('Usage: node mp3Parser.mjs <file.mp3>')
		process.exitCode = 1
	} else {
		try {
			const fileBuffer = await readFile(path)
			const result = parseMpegLayer3(fileBuffer)

			console.log({
				id3v2Tag: result.id3v2Tag,
				isMpegLayer3: true,
				mpegLayer3FrameCount: result.frameCount,
			})
		} catch (error) {
			console.error(error instanceof Error ? error.message : String(error))
			process.exitCode = 1
		}
	}
}
