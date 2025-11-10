import { Response } from 'express';

export const sendSuccess = (res: Response, data: any, message: string = 'Success') => {
  res.status(200).json({ success: true, message, data });
};

export const sendError = (
  res: Response,
  message: string = 'Internal Server Error',
  statusCode: number = 500,
) => {
  res.status(statusCode).json({ success: false, message });
};
