import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import type { NextFunction, Request, Response } from 'express'
import { countMpegLayer3FramesFromStream } from '../../parsing/mp3Parser.js'

export async function handleFileUpload(
	req: Request,
	res: Response,
	next: NextFunction,
) {
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
}
