import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

type AdminBlogPost = {
  id: number;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
};

export default function AdminBlogsListPage() {
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const load = async () => {
      try {
        const data = await api<AdminBlogPost[]>('/api/admin/blogs');
        setPosts(data);
      } catch (e: any) {
        console.error(e);
        setError(e.message ?? 'Error loading posts');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this post?')) return;
  
    try {
      const token = localStorage.getItem('admin_blog_token');
  
      const res = await fetch(
        `${import.meta.env.VITE_API_URL}/api/admin/blogs/${id}`,
        {
          method: 'DELETE',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );
  
      if (!res.ok) {
        const text = await res.text();
        console.error('Delete failed', res.status, text);
        alert('Error deleting the post');
        return;
      }
  
      setPosts((prev) => prev.filter((p) => p.id !== id));
    } catch (e) {
      console.error(e);
      alert('Error deleting the post');
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-montserrat font-bold text-[#031634]">
            Blog Posts (Admin)
          </h1>
          <button
            onClick={() => navigate('/admin/blogs/new')}
            className="px-4 py-2 rounded-lg bg-[#031634] text-white font-montserrat text-sm hover:bg-[#042045] transition-colors"
          >
            + New Post
          </button>
        </div>

        {posts.length === 0 ? (
          <p className="text-gray-500">No posts yet.</p>
        ) : (
          <>
            {/* Desktop Table View */}
            <div className="hidden md:block">
              <table className="w-full bg-white shadow-sm rounded-lg overflow-hidden text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-3 font-semibold">Title</th>
                    <th className="text-left p-3 font-semibold">Slug</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                    <th className="text-left p-3 font-semibold">Published</th>
                    <th className="text-center p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="p-3 font-medium">{p.title}</td>
                      <td className="p-3 text-xs text-gray-500">{p.slug}</td>
                      <td className="p-3">
                        <span
                          className={
                            p.status === 'published'
                              ? 'px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium'
                              : 'px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium'
                          }
                        >
                          {p.status}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-gray-500">
                        {p.published_at
                          ? new Date(p.published_at).toLocaleDateString()
                          : '-'}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => navigate(`/admin/blogs/${p.id}`)}
                            className="px-3 py-1 rounded-md border border-gray-300 text-xs hover:bg-gray-50 transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(p.id)}
                            className="px-3 py-1 rounded-md border border-red-300 text-xs text-red-600 hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
              {posts.map((p) => (
                <div key={p.id} className="bg-white rounded-lg shadow-sm p-4 space-y-3">
                  <div>
                    <h3 className="font-medium text-[#031634] mb-1">{p.title}</h3>
                    <p className="text-xs text-gray-500">{p.slug}</p>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span
                      className={
                        p.status === 'published'
                          ? 'px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium'
                          : 'px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium'
                      }
                    >
                      {p.status}
                    </span>
                    <span className="text-xs text-gray-500">
                      {p.published_at
                        ? new Date(p.published_at).toLocaleDateString()
                        : 'Not published'}
                    </span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => navigate(`/admin/blogs/${p.id}`)}
                      className="flex-1 px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="flex-1 px-3 py-2 rounded-md border border-red-300 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}