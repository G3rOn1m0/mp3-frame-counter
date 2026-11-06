import { Router } from 'express'
import fileUploadRouter from './file_upload/router.js'

const router = Router()

router.use('/file_upload', fileUploadRouter)

export default router
