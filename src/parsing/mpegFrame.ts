import type { Buffer } from 'node:buffer'
import { MpegParseError } from './errors.js'

const mpeg1Layer3Bitrates = [
	0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0,
] as const
const baseSampleRates = [44100, 48000, 32000] as const

type FrameHeaderFields = {
	sync: number
	version: number
	layer: number
	bitrateIndex: number
	sampleRateIndex: number
	padding: number
	hasCrc: boolean
	channelMode: number
}

export type FrameInfo = {
	sampleRate: number
	frameLength: number
	isMetadataFrame: boolean
}

export type FrameParseOptions = {
	baseOffset?: number
	allowIncomplete?: boolean
	// Set only after a valid frame: a non-sync position then marks the end of audio.
	stopAtInvalidSync?: boolean
}

function readHeaderFields(header: number): FrameHeaderFields {
	return {
		sync: header >>> 21,
		version: (header >>> 19) & 0x03,
		layer: (header >>> 17) & 0x03,
		bitrateIndex: (header >>> 12) & 0x0f,
		sampleRateIndex: (header >>> 10) & 0x03,
		padding: (header >>> 9) & 0x01,
		hasCrc: ((header >>> 16) & 0x01) === 0,
		channelMode: (header >>> 6) & 0x03,
	}
}

function validateHeader(fields: FrameHeaderFields, offset: number): void {
	if (fields.sync !== 0x7ff) {
		throw new MpegParseError('INVALID_FRAME', 'Invalid MPEG frame sync', offset)
	}
	if (fields.version !== 0x03) {
		throw new MpegParseError(
			'UNSUPPORTED_MPEG_VERSION',
			'MPEG-1 audio is required',
			offset,
		)
	}
	if (fields.layer !== 0x01) {
		throw new MpegParseError(
			'UNSUPPORTED_MPEG_LAYER',
			'Layer III audio is required',
			offset,
		)
	}
	if (fields.bitrateIndex === 0 || fields.bitrateIndex === 0x0f) {
		throw new MpegParseError(
			'INVALID_FRAME',
			'Invalid or unsupported MPEG bitrate index',
			offset,
		)
	}
	if (fields.sampleRateIndex === 0x03) {
		throw new MpegParseError(
			'INVALID_FRAME',
			'Reserved MPEG sample-rate index',
			offset,
		)
	}
}

export function readLayer3Frame(
	buffer: Buffer,
	offset: number,
	audioEnd: number,
	options: FrameParseOptions = {},
): FrameInfo | null {
	const {
		baseOffset = 0,
		allowIncomplete = false,
		stopAtInvalidSync = false,
	} = options
	if (offset === audioEnd) {
		return null
	}
	if (offset + 4 > audioEnd) {
		if (allowIncomplete) {
			return null
		}
		throw new MpegParseError(
			'TRUNCATED_FRAME',
			'Truncated MPEG frame header',
			baseOffset + offset,
		)
	}

	const fields = readHeaderFields(buffer.readUInt32BE(offset))
	if (stopAtInvalidSync && fields.sync !== 0x7ff) {
		return null
	}
	validateHeader(fields, baseOffset + offset)

	const bitrateIndexValue = mpeg1Layer3Bitrates[fields.bitrateIndex]
	const sampleRate = baseSampleRates[fields.sampleRateIndex]
	if (bitrateIndexValue === undefined || sampleRate === undefined) {
		throw new MpegParseError(
			'INVALID_FRAME',
			'Invalid MPEG bitrate or sample-rate index',
			baseOffset + offset,
		)
	}

	const bitrate = bitrateIndexValue * 1000
	const frameLength = Math.floor((144 * bitrate) / sampleRate) + fields.padding
	if (offset + frameLength > audioEnd) {
		if (allowIncomplete) {
			return null
		}
		throw new MpegParseError(
			'TRUNCATED_FRAME',
			'MPEG frame extends beyond the end of the audio data',
			baseOffset + offset,
		)
	}

	const sideInformationLength = fields.channelMode === 0x03 ? 17 : 32
	const xingOffset =
		offset + 4 + (fields.hasCrc ? 2 : 0) + sideInformationLength
	const xingIdentifier = buffer.toString('ascii', xingOffset, xingOffset + 4)
	// VBRI headers sit at a fixed offset, regardless of channel mode or CRC.
	const vbriIdentifier = buffer.toString('ascii', offset + 36, offset + 40)

	return {
		sampleRate,
		frameLength,
		isMetadataFrame:
			xingIdentifier === 'Xing' ||
			xingIdentifier === 'Info' ||
			vbriIdentifier === 'VBRI',
	}
}
