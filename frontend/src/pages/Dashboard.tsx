import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../api/api';
import { Folder, Plus, LogOut } from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  role: string;
}

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchWorkspaces();
  }, []);

  const fetchWorkspaces = async () => {
    try {
      const { data } = await api.get('/workspaces');
      setWorkspaces(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateWorkspace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWorkspaceName.trim()) return;
    try {
      await api.post('/workspaces', { name: newWorkspaceName });
      setNewWorkspaceName('');
      setIsCreating(false);
      fetchWorkspaces();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Folder className="h-6 w-6 text-blue-600 mr-2" />
              <span className="font-bold text-xl text-slate-800">SecureShare</span>
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

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-slate-900">Your Workspaces</h1>
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

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workspaces.map((ws) => (
            <div
              key={ws.id}
              onClick={() => navigate(`/workspace/${ws.id}`)}
              className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition cursor-pointer group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  <div className="bg-blue-50 text-blue-600 p-3 rounded-lg mr-4 group-hover:bg-blue-100 transition">
                    <Folder size={24} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-800 text-lg">{ws.name}</h3>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-full mt-1 inline-block">
                      {ws.role}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
          {workspaces.length === 0 && !isCreating && (
            <div className="col-span-full text-center py-12 text-slate-500">
              No workspaces found. Create one to get started.
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
