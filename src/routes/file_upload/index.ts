import type { Request, Response } from 'express'
import { Router } from 'express'
import fs from 'fs'
import multer from 'multer'
import { countMpegLayer3Frames } from '../../parsing/mp3Parser.js'

const upload = multer({ dest: 'uploads/' })

const router = Router()

router.post('/', upload.single('file'), (req: Request, res: Response) => {
	// TODO: Validate and process the uploaded file.
	const file = req.file

	if (!file) {
		return res.status(400).json({ message: 'No file uploaded.' })
	}
	// TODO: Process the uploaded file.
	const filePath = file.path
	const fileBuffer = fs.readFileSync(filePath)
	const frameCount = countMpegLayer3Frames(fileBuffer)
	return res.json({ frameCount })
})

export default router
