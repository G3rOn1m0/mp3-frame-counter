import { Router } from 'express'
import multer from 'multer'
import { handleFileUpload } from './controller.js'

export const DEFAULT_UPLOAD_LIMIT_BYTES = 100 * 1024 * 1024

export function createFileUploadRouter(
	uploadLimitBytes = DEFAULT_UPLOAD_LIMIT_BYTES,
) {
	const upload = multer({
		dest: 'uploads/',
		limits: { fileSize: uploadLimitBytes },
	})

	const router = Router()
	router.post('/', upload.single('file'), handleFileUpload)

	return router
}

export default createFileUploadRouter()
