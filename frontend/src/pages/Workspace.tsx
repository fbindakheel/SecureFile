import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/api';
import { File as FileIcon, Upload, Share2, Download, ArrowLeft, ShieldCheck, AlertTriangle } from 'lucide-react';

interface FileItem {
  id: string;
  originalName: string;
  size: number;
  scanStatus: string;
  createdAt: string;
}

export const Workspace = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Share modal state
  const [shareFileId, setShareFileId] = useState<string | null>(null);
  const [sharePassword, setSharePassword] = useState('');
  const [shareLink, setShareLink] = useState('');

  useEffect(() => {
    fetchFiles();
  }, [id]);

  const fetchFiles = async () => {
    try {
      const { data } = await api.get(`/files/workspace/${id}`);
      setFiles(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('workspaceId', id!);

    setIsUploading(true);
    setUploadError('');

    try {
      await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      fetchFiles();
    } catch (err: any) {
      setUploadError(err.response?.data?.error || 'Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDownload = async (fileId: string, filename: string) => {
    try {
      const response = await api.get(`/files/${fileId}/download`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
    }
  };

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data } = await api.post('/shares', {
        fileId: shareFileId,
        password: sharePassword || undefined,
        expiresInDays: 7
      });
      setShareLink(`${window.location.origin}/share/${data.token}`);
    } catch (err) {
      console.error(err);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-slate-500 hover:text-slate-800 transition mb-6"
        >
          <ArrowLeft size={18} className="mr-1" /> Back to Dashboard
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <h2 className="text-xl font-bold text-slate-800">Workspace Files</h2>
            <div>
              <input
                type="file"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 transition disabled:opacity-50"
              >
                {isUploading ? (
                  <span className="animate-pulse">Encrypting & Scanning...</span>
                ) : (
                  <>
                    <Upload size={18} className="mr-2" /> Upload File
                  </>
                )}
              </button>
            </div>
          </div>

          {uploadError && (
            <div className="p-4 bg-red-50 text-red-600 border-b border-red-100 flex items-center">
              <AlertTriangle size={18} className="mr-2" /> {uploadError}
            </div>
          )}

          <div className="divide-y divide-slate-100">
            {files.map(file => (
              <div key={file.id} className="p-4 hover:bg-slate-50 transition flex items-center justify-between">
                <div className="flex items-center">
                  <div className="bg-slate-100 text-slate-500 p-3 rounded-lg mr-4">
                    <FileIcon size={24} />
                  </div>
                  <div>
                    <h4 className="font-medium text-slate-800">{file.originalName}</h4>
                    <div className="flex items-center text-xs text-slate-500 mt-1 space-x-3">
                      <span>{formatSize(file.size)}</span>
                      {file.scanStatus === 'CLEAN' ? (
                        <span className="flex items-center text-green-600">
                          <ShieldCheck size={14} className="mr-1" /> Clean
                        </span>
                      ) : (
                        <span className="flex items-center text-red-600">
                          <AlertTriangle size={14} className="mr-1" /> Infected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex space-x-2">
                  <button
                    onClick={() => {
                      setShareFileId(file.id);
                      setShareLink('');
                      setSharePassword('');
                    }}
                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                    title="Share"
                  >
                    <Share2 size={18} />
                  </button>
                  <button
                    onClick={() => handleDownload(file.id, file.originalName)}
                    className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition"
                    title="Download"
                  >
                    <Download size={18} />
                  </button>
                </div>
              </div>
            ))}
            {files.length === 0 && (
              <div className="p-12 text-center text-slate-500">
                No files in this workspace yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Share Modal */}
      {shareFileId && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold mb-4 text-slate-800">Share File</h3>
            {!shareLink ? (
              <form onSubmit={handleShare}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Password (Optional)
                  </label>
                  <input
                    type="password"
                    value={sharePassword}
                    onChange={e => setSharePassword(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                    placeholder="Leave blank for public link"
                  />
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => setShareFileId(null)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                  >
                    Generate Link
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <div className="p-3 bg-slate-100 rounded-lg break-all text-sm font-mono text-slate-800 mb-4 border border-slate-200">
                  {shareLink}
                </div>
                <button
                  onClick={() => setShareFileId(null)}
                  className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
