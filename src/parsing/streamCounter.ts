import { Buffer } from 'node:buffer'
import { MpegParseError } from './errors.js'
import { parseID3v2Header } from './id3.js'
import { readLayer3Frame } from './mpegFrame.js'

type StreamCounterState = {
	pending: Buffer
	pendingOffset: number
	totalBytes: number
	id3TagEnd: number | null
	id3BytesRemaining: number
	prefixChecked: boolean
	frameCount: number
	physicalFrameCount: number
	streamSampleRate: number | null
}

function createState(): StreamCounterState {
	return {
		pending: Buffer.alloc(0),
		pendingOffset: 0,
		totalBytes: 0,
		id3TagEnd: null,
		id3BytesRemaining: 0,
		prefixChecked: false,
		frameCount: 0,
		physicalFrameCount: 0,
		streamSampleRate: null,
	}
}

function consume(state: StreamCounterState, byteCount: number): void {
	state.pending = state.pending.subarray(byteCount)
	state.pendingOffset += byteCount
}

function checkPrefix(state: StreamCounterState): void {
	if (state.prefixChecked || state.pending.length < 3) {
		return
	}

	state.prefixChecked = true
	if (state.pending.subarray(0, 3).toString('ascii') !== 'ID3') {
		return
	}
	if (state.pending.length < 10) {
		state.prefixChecked = false
		return
	}

	state.id3TagEnd = parseID3v2Header(state.pending).tagEnd
	const skippedHeaderAndTag = Math.min(state.pending.length, state.id3TagEnd)
	consume(state, skippedHeaderAndTag)
	state.id3BytesRemaining = state.id3TagEnd - skippedHeaderAndTag
}

function skipRemainingID3(state: StreamCounterState): boolean {
	if (state.id3BytesRemaining === 0) {
		return false
	}

	const skippedBytes = Math.min(state.pending.length, state.id3BytesRemaining)
	consume(state, skippedBytes)
	state.id3BytesRemaining -= skippedBytes
	return state.id3BytesRemaining > 0
}

function countAvailableFrames(state: StreamCounterState, final: boolean): void {
	let audioEnd = state.pending.length
	if (!final) {
		audioEnd = Math.max(0, audioEnd - 128)
	} else if (
		audioEnd >= 128 &&
		state.pending.subarray(audioEnd - 128, audioEnd - 125).toString('ascii') ===
			'TAG'
	) {
		audioEnd -= 128
	}

	while (audioEnd > 0) {
		const frame = readLayer3Frame(state.pending, 0, audioEnd, {
			baseOffset: state.pendingOffset,
			allowIncomplete: !final,
			stopAtInvalidSync: state.physicalFrameCount > 0,
		})
		if (!frame) {
			break
		}
		if (
			state.streamSampleRate !== null &&
			frame.sampleRate !== state.streamSampleRate
		) {
			throw new MpegParseError(
				'INCONSISTENT_SAMPLE_RATE',
				'MPEG frame sample rate changed within the stream',
				state.pendingOffset,
			)
		}

		state.streamSampleRate = frame.sampleRate
		if (state.physicalFrameCount > 0 || !frame.isMetadataFrame) {
			state.frameCount += 1
		}
		state.physicalFrameCount += 1
		consume(state, frame.frameLength)
		audioEnd -= frame.frameLength
	}
}

function processChunk(state: StreamCounterState, chunk: Uint8Array): void {
	const nextChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
	state.totalBytes += nextChunk.length
	state.pending = state.pending.length
		? Buffer.concat([state.pending, nextChunk])
		: nextChunk

	checkPrefix(state)
	if (skipRemainingID3(state)) {
		return
	}
	if (state.prefixChecked) {
		countAvailableFrames(state, false)
	}
}

function finish(state: StreamCounterState): number {
	if (!state.prefixChecked) {
		if (state.pending.subarray(0, 3).toString('ascii') === 'ID3') {
			throw new MpegParseError(
				'INVALID_ID3V2_TAG',
				'ID3v2 header is incomplete',
			)
		}
		state.prefixChecked = true
	}

	if (state.id3TagEnd !== null && state.id3TagEnd > state.totalBytes) {
		throw new MpegParseError(
			'INVALID_ID3V2_TAG',
			'ID3v2 tag declares a size beyond the end of the file',
		)
	}

	countAvailableFrames(state, true)
	if (state.frameCount === 0) {
		throw new MpegParseError(
			'NO_AUDIO_FRAMES',
			'No MPEG-1 Layer III audio frames found',
			state.id3TagEnd ?? 0,
		)
	}
	if (state.frameCount < 2) {
		throw new MpegParseError(
			'INSUFFICIENT_FRAMES',
			'Could not confirm MPEG audio: at least two consecutive frames are required',
		)
	}

	return state.frameCount
}

/**
 * Counts MPEG-1 Layer III audio frames from a chunked input stream.
 *
 * A leading Xing/Info or VBRI metadata frame is excluded from the count.
 *
 * @throws {MpegParseError} If the stream is invalid, truncated, or unsupported.
 */
export async function countMpegLayer3FramesFromStream(
	chunks: AsyncIterable<Uint8Array>,
): Promise<number> {
	const state = createState()
	for await (const chunk of chunks) {
		processChunk(state, chunk)
	}
	return finish(state)
}
