import { Router } from 'express'
import {
	createFileUploadRouter,
	DEFAULT_UPLOAD_LIMIT_BYTES,
} from './file_upload/router.js'

export { DEFAULT_UPLOAD_LIMIT_BYTES }

export function createApiRouter(uploadLimitBytes = DEFAULT_UPLOAD_LIMIT_BYTES) {
	const router = Router()
	router.use('/file_upload', createFileUploadRouter(uploadLimitBytes))
	return router
}

export default createApiRouter()
