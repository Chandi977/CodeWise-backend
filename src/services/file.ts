import File from '../models/File';

export const getFilesByProject = async (projectId: string) => {
  return File.find({ project: projectId });
};

export const createFile = async (fileData: any) => {
  const newFile = new File(fileData);
  return newFile.save();
};
