import { Router } from 'express'
import multer from 'multer'
import { handleFileUpload } from './controller.js'

const upload = multer({
	dest: 'uploads/',
	limits: { fileSize: 100 * 1024 * 1024 },
})

const router = Router()

router.post('/', upload.single('file'), handleFileUpload)

export default router
