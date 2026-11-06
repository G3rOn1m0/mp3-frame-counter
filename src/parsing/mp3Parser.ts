import { Buffer } from 'node:buffer'
import { MpegParseError } from './errors.js'
import { getAudioEnd, parseID3v2 } from './id3.js'
import { readLayer3Frame } from './mpegFrame.js'
import { countMpegLayer3FramesFromStream } from './streamCounter.js'

export type { MpegParseErrorCode } from './errors.js'
export { countMpegLayer3FramesFromStream, MpegParseError }

type MpegLayer3ParseResult = {
	frameCount: number
}

function parseMpegLayer3(buffer: unknown): MpegLayer3ParseResult {
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
		const frame = readLayer3Frame(buffer, offset, audioEnd, {
			stopAtInvalidSync: physicalFrameCount > 0,
		})
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
		if (physicalFrameCount > 0 || !frame.isMetadataFrame) {
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

	return { frameCount }
}

/** Returns whether the input contains a parseable MPEG-1 Layer III audio stream. */
export function isMpegLayer3(buffer: unknown): boolean {
	try {
		parseMpegLayer3(buffer)
		return true
	} catch {
		return false
	}
}

/**
 * Counts MPEG-1 Layer III audio frames in a complete MP3 buffer.
 *
 * A leading Xing/Info or VBRI metadata frame is excluded from the count. Invalid or
 * unsupported input throws a {@link MpegParseError} with a code and, when
 * available, the byte offset where parsing failed.
 *
 * @throws {MpegParseError} If the buffer is invalid or the stream is unsupported.
 */
export function countMpegLayer3Frames(buffer: unknown): number {
	return parseMpegLayer3(buffer).frameCount
}
