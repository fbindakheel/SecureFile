import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';
import { Folder, Plus, LogOut, Trash2, Play, Film } from 'lucide-react';
import { WatchParty } from '../components/WatchParty';

interface Workspace {
  id: string;
  name: string;
  role: string;
}

interface VideoFile {
  id: string;
  originalName: string;
  workspaceId: string;
}

export const Dashboard = () => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [videos, setVideos] = useState<VideoFile[]>([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [watchingFile, setWatchingFile] = useState<VideoFile | null>(null);
  
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [wsRes, vidRes] = await Promise.all([
        api.get('/workspaces'),
        api.get('/files/all-videos')
      ]);
      setWorkspaces(wsRes.data);
      setVideos(vidRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWorkspaces = async () => {
    try {
      const { data } = await api.get('/workspaces');
      setWorkspaces(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteWorkspace = async (e: React.MouseEvent, wsId: string) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this workspace and all its files?')) return;
    try {
      await api.delete(`/workspaces/${wsId}`);
      fetchWorkspaces();
    } catch (err) {
      console.error(err);
      alert('Only Admins can delete workspaces');
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;

    const tempId = 'temp-' + Date.now();
    const optimisticWs = { id: tempId, name: newWorkspaceName, role: 'ADMIN' };
    setWorkspaces([optimisticWs, ...workspaces]);
    setNewWorkspaceName('');
    setIsCreating(false);

    try {
      await api.post('/workspaces', { name: newWorkspaceName });
      fetchWorkspaces();
    } catch (err) {
      console.error(err);
      setWorkspaces(workspaces.filter(ws => ws.id !== tempId));
      alert('Failed to create workspace');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Folder className="h-6 w-6 text-blue-600 mr-2" />
              <span className="font-bold text-xl text-slate-800">SecureFile</span>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-slate-600">Welcome, {user?.name}</span>
              <button
                onClick={logout}
                className="text-slate-500 hover:text-red-600 transition flex items-center"
              >
                <LogOut size={18} className="mr-1" />
                <span className="text-sm">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
        {/* Watch Together Section */}
        {videos.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center mb-6">
              <Film className="h-6 w-6 text-blue-600 mr-2" />
              <h2 className="text-2xl font-bold text-slate-900">Watch Together</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {videos.map(vid => (
                <div 
                  key={vid.id}
                  className="bg-slate-900 rounded-xl overflow-hidden group relative aspect-video flex items-center justify-center border border-slate-800 shadow-lg"
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-60"></div>
                  <Film className="text-slate-700 h-12 w-12" />
                  
                  <div className="absolute inset-0 flex flex-col justify-end p-4">
                    <p className="text-white font-medium text-sm truncate mb-2">{vid.originalName}</p>
                    <button
                      onClick={() => setWatchingFile({ id: vid.id, originalName: vid.originalName, workspaceId: vid.workspaceId })}
                      className="bg-blue-600 hover:bg-blue-700 text-white py-1.5 rounded-lg flex items-center justify-center transition scale-90 group-hover:scale-100"
                    >
                      <Play size={16} className="mr-1 fill-current" /> Watch Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Your Workspaces</h1>
            <p className="text-slate-500 text-sm">Collaborate securely with your team</p>
          </div>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 transition"
          >
            <Plus size={18} className="mr-1" />
            New Workspace
          </button>
        </div>

        {isCreating && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-6">
            <form onSubmit={handleCreateWorkspace} className="flex gap-4">
              <input
                type="text"
                autoFocus
                placeholder="Workspace Name"
                value={newWorkspaceName}
                onChange={(e) => setNewWorkspaceName(e.target.value)}
                className="flex-1 border border-slate-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="submit"
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition font-medium"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="bg-slate-200 text-slate-700 px-6 py-2 rounded-lg hover:bg-slate-300 transition font-medium"
              >
                Cancel
              </button>
            </form>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 animate-pulse">
                <div className="flex items-center space-x-4">
                  <div className="h-10 w-10 bg-slate-200 rounded-lg"></div>
                  <div className="flex-1">
                    <div className="h-4 bg-slate-200 rounded w-3/4 mb-2"></div>
                    <div className="h-3 bg-slate-200 rounded w-1/4"></div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workspaces.map((ws) => (
              <div
                key={ws.id}
                onClick={() => navigate(`/workspace/${ws.id}`)}
                className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center text-left">
                    <div className="bg-blue-50 text-blue-600 p-3 rounded-lg group-hover:bg-blue-600 group-hover:text-white transition">
                      <Folder size={24} />
                    </div>
                    <div className="ml-4">
                      <h3 className="font-semibold text-slate-800 text-lg">{ws.name}</h3>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full mt-1 inline-block">
                        {ws.role}
                      </span>
                    </div>
                  </div>
                  {ws.role === 'ADMIN' && (
                    <button
                      onClick={(e) => handleDeleteWorkspace(e, ws.id)}
                      className="p-2 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                      title="Delete Workspace"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {workspaces.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                You haven't joined any workspaces yet. Create one to get started!
              </div>
            )}
          </div>
        )}
      </main>

      {watchingFile && (
        <WatchParty
          fileId={watchingFile.id}
          fileName={watchingFile.originalName}
          workspaceId={watchingFile.workspaceId}
          user={user}
          onClose={() => setWatchingFile(null)}
        />
      )}
    </div>
  );
};
