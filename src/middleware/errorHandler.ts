import type { ErrorRequestHandler } from 'express'
import multer from 'multer'
import {
	MpegParseError,
	MpegParseErrorCodeToApiResponse,
} from '../parsing/errors.js'

export const errorHandler: ErrorRequestHandler = (error, _req, res, next) => {
	if (res.headersSent) {
		return next(error)
	}

	if (error instanceof MpegParseError) {
		const response = MpegParseErrorCodeToApiResponse[error.code]
		return res.status(response.status).json({
			code: error.code,
			message: response.message,
			offset: error.offset,
		})
	}

	if (error instanceof multer.MulterError) {
		if (error.code === 'LIMIT_FILE_SIZE') {
			return res.status(413).json({
				code: 'FILE_TOO_LARGE',
				message: 'Uploaded file exceeds the configured size limit.',
			})
		}

		return res.status(400).json({
			code: 'INVALID_UPLOAD',
			message: 'The file upload request is invalid.',
		})
	}

	console.error(error)
	return res.status(500).json({
		code: 'INTERNAL_SERVER_ERROR',
		message: 'An unexpected server error occurred.',
	})
}
