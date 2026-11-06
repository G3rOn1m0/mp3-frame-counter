import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import type { Request, Response } from 'express'
import { Router } from 'express'
import multer from 'multer'
import { countMpegLayer3FramesFromStream } from '../../parsing/mp3Parser.js'

const upload = multer({ dest: 'uploads/' })

const router = Router()

router.post(
	'/',
	upload.single('file'),
	async (req: Request, res: Response, next) => {
		const file = req.file

		if (!file) {
			return res.status(400).json({ message: 'No file uploaded.' })
		}
		try {
			const frameCount = await countMpegLayer3FramesFromStream(
				createReadStream(file.path),
			)
			return res.json({ frameCount })
		} catch (error) {
			return next(error)
		} finally {
			await unlink(file.path).catch(() => {})
		}
	},
)

export default router
