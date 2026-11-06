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

/** Mapping MpegParseErrorCode to API error responses. */
export const MpegParseErrorCodeToApiResponse: Record<
	MpegParseErrorCode,
	{ status: number; message: string }
> = {
	INVALID_INPUT: { status: 400, message: 'Invalid input.' },
	INVALID_ID3V2_TAG: { status: 422, message: 'Invalid ID3v2 tag.' },
	UNSUPPORTED_MPEG_VERSION: {
		status: 415,
		message: 'Unsupported MPEG version.',
	},
	UNSUPPORTED_MPEG_LAYER: { status: 415, message: 'Unsupported MPEG layer.' },
	INVALID_FRAME: { status: 422, message: 'Invalid frame.' },
	TRUNCATED_FRAME: { status: 422, message: 'Truncated frame.' },
	NO_AUDIO_FRAMES: { status: 422, message: 'No audio frames found.' },
	INSUFFICIENT_FRAMES: { status: 422, message: 'Insufficient frames.' },
	INCONSISTENT_SAMPLE_RATE: {
		status: 422,
		message: 'Inconsistent sample rate.',
	},
}
