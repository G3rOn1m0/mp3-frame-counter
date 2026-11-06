/** Stable categories identifying why an MP3 input could not be parsed. */
export type MpegParseErrorCode =
	| 'INVALID_INPUT'
	| 'INVALID_ID3V2_TAG'
	| 'UNSUPPORTED_MPEG_VERSION'
	| 'UNSUPPORTED_MPEG_LAYER'
	| 'INVALID_FRAME'
	| 'TRUNCATED_FRAME'
	| 'NO_AUDIO_FRAMES'
	| 'INSUFFICIENT_FRAMES'
	| 'INCONSISTENT_SAMPLE_RATE'

/** Error raised when an input or MPEG frame fails parsing validation. */
export class MpegParseError extends Error {
	/** Stable error category for callers that need to handle parse failures. */
	readonly code: MpegParseErrorCode
	/** Byte offset where parsing failed, or `null` when the error is file-wide. */
	readonly offset: number | null

	constructor(code: MpegParseErrorCode, message: string, offset?: number) {
		super(offset === undefined ? message : `${message} at byte ${offset}`)
		this.name = 'MpegParseError'
		this.code = code
		this.offset = offset ?? null
	}
}
