import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

export const uploadToCloud = async (filePath: string, fileName: string): Promise<string> => {
  const fileBuffer = fs.readFileSync(filePath);
  const { data, error } = await supabase.storage
    .from('files')
    .upload(fileName, fileBuffer, {
      contentType: 'application/octet-stream',
      upsert: true
    });

  if (error) throw error;
  return data.path;
};

export const downloadFromCloud = async (fileName: string): Promise<Buffer> => {
  const { data, error } = await supabase.storage
    .from('files')
    .download(fileName);

  if (error) throw error;
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

export const deleteFromCloud = async (fileName: string): Promise<void> => {
  const { error } = await supabase.storage
    .from('files')
    .remove([fileName]);

  if (error) throw error;
};

export const getSignedUploadUrl = async (storedName: string) => {
  const { data, error } = await supabase.storage
    .from('files')
    .createSignedUploadUrl(storedName);

  if (error) throw error;
  return data.signedUrl;
};
