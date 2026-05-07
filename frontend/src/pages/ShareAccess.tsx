import { useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/api';
import { Lock, Download, AlertTriangle } from 'lucide-react';

export const ShareAccess = () => {
  const { token } = useParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);

  const handleAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsDownloading(true);

    try {
      const response = await api.post(`/shares/${token}`, 
        { password },
        { responseType: 'blob' }
      );

      // Extract filename from Content-Disposition header if possible
      const contentDisposition = response.headers['content-disposition'];
      let filename = 'downloaded_file';
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="(.+)"/);
        if (match && match.length > 1) {
          filename = match[1];
        }
      }

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      if (err.response?.data instanceof Blob) {
        // Blob to JSON for error message
        const text = await err.response.data.text();
        try {
          const json = JSON.parse(text);
          setError(json.error || 'Access denied');
        } catch {
          setError('Access denied');
        }
      } else {
        setError('Access denied');
      }
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-xl shadow-lg border border-slate-100 w-full max-w-md text-center">
        <div className="mx-auto bg-blue-50 text-blue-600 w-16 h-16 rounded-full flex items-center justify-center mb-6">
          <Download size={32} />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Download Shared File</h2>
        <p className="text-slate-500 mb-8">This file has been securely shared with you.</p>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-6 flex items-center justify-center">
            <AlertTriangle size={16} className="mr-2" /> {error}
          </div>
        )}

        <form onSubmit={handleAccess} className="space-y-4">
          <div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-slate-400" size={18} />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password (if required)"
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={isDownloading}
            className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50"
          >
            {isDownloading ? 'Decrypting & Downloading...' : 'Download File'}
          </button>
        </form>
      </div>
    </div>
  );
};
